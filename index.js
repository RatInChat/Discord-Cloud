// import required modules
import discord from 'discord.js';
import express from 'express';
import http from 'http';
import multer from 'multer';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();
// Set up database
import Database from 'better-sqlite3';
const db = new Database('database.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    messageId TEXT,
    chunkIndex INTEGER,
    channelId TEXT
  )
`);

// Set up Discord bot
const bot = new discord.Client({
  intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent']
});

bot.on('ready', async () => {
  console.log('Bot is ready');
  // Fetch uploaded files on server startup
  await fetchUploadedFiles();
});

bot.login(process.env.TOKEN);

const app = express();
const server = http.createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use(express.static(join(__dirname, 'public')));
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: Infinity } // Set the file size limit to Infinity
});

const uploadedFiles = [];
const chunkSize = 25 * 1024 * 1024; // Define the chunk size here
async function fetchUploadedFiles() {
  const files = db.prepare('SELECT DISTINCT name, messageId, chunkIndex, channelId FROM files').all();

  uploadedFiles.length = 0; // Clear the array

  for (const file of files) {
    const { name, messageId, chunkIndex, channelId } = file;

    try {
      const channel = await bot.channels.fetch(channelId, { force: true });
      if (!channel) {
        console.error(`Channel not found: ${channelId}`);
        continue;
      }

      if (chunkIndex !== null) {
        const chunks = db.prepare('SELECT messageId FROM files WHERE name = ?').all(name);

        if (chunks.length === 0) {
          console.error(`Chunks not found for file: ${name}`);
          continue;
        }

        const attachments = [];
        for (const chunk of chunks) {
          const message = await channel.messages.fetch(chunk.messageId);
          if (message && message.attachments.size > 0) {
            attachments.push(message.attachments.first());
          }
        }

        if (attachments.length > 0) {
          // Check if the file already exists in the uploadedFiles array
          const existingFile = uploadedFiles.find((file) => file.name === name);
          if (existingFile) {
            // Append attachments to the existing file entry
            existingFile.attachments.push(...attachments);
          } else {
            // Create a new entry for the file
            uploadedFiles.push({
              name,
              messageId,
              channelId,
              attachments,
            });
          }
        }
      } else {
        // Non-split file, find the message directly
        const message = await channel.messages.fetch(messageId);
        if (!message) {
          console.error(`Message not found: ${messageId}`);
          continue;
        }

        const attachment = message.attachments.first();
        if (attachment) {
          uploadedFiles.push({
            name,
            messageId,
            channelId,
            attachments: [attachment],
          });
        }
      }
    } catch (error) {
      console.error(`Failed to fetch file: ${name}`, error);
    }
  }
}

function generateFilesHTML() {
  const mergedFiles = new Map(); // Map to store merged files

  for (const file of uploadedFiles) {
    const { name, messageId, attachments } = file;

    if (attachments) {
      // Split file
      if (!mergedFiles.has(messageId)) {
        // Add the first attachment to the mergedFiles map
        mergedFiles.set(messageId, {
          name,
          messageId,
          attachments: [attachments[0]],
        });
      } else {
        // Append the attachment to the existing entry in the mergedFiles map
        mergedFiles.get(messageId).attachments.push(attachments[0]);
      }
    }
  }

  // Generate HTML for uploaded files
  return Array.from(mergedFiles.values())
    .map((file) => {
      const { name, messageId, attachments } = file;

      if (attachments.length > 1) {
        // Split file, generate download link for merged file
        const downloadLink = `/download-merged/${messageId}`;
        return `
          <div class="file" data-name="${name}" onclick="handleFileFocus(event)">
            <!-- <a href="${downloadLink}" download>${name}</a> -->
            ${name}
          </div>
        `;
      } else {
        // Non-split file, generate download link for single file
        const downloadLink = `/download/${messageId}`;
        return `
          <div class="file" data-name="${name}" onclick="handleFileFocus(event)">
            <!-- <a href="${downloadLink}" download>${name}</a> -->
            ${name}
          </div>
        `;
      }
    })
    .join('');
}

// Index route
app.get('/', async (req, res) => {
  // Fetch uploaded files on page load
  await fetchUploadedFiles();

  // Generate the HTML for displaying the uploaded files
  const filesHTML = generateFilesHTML();

  // Send the index.html file with the uploaded files list
  fs.readFile('./index.html', 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }
  
    // Replace the placeholder with the variable value
    const modifiedHTML = data.replace('${filesHTML}', filesHTML);
  
    // Send the modified HTML as the response
    res.send(modifiedHTML);
  });
});

app.get('/download/:messageId', async (req, res) => {
  const { messageId } = req.params;

  const file = uploadedFiles.find((file) => file.messageId === messageId);
  if (!file) {
    res.status(404).send('File not found');
    return;
  }

  const { channelId, attachments } = file;

  try {
    const channel = await bot.channels.fetch(channelId, { force: true });
    if (!channel) {
      res.status(500).send('Failed to fetch channel');
      return;
    }

    if (attachments) {
      // Split file, download merged file
      const buffers = [];
      for (const attachment of attachments) {
        const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
        const fileBuffer = Buffer.from(response.data);
        buffers.push(fileBuffer);
      }

      const mergedBuffer = Buffer.concat(buffers);

      const attachment = attachments[0];
      res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.name}"`);
      res.setHeader('Content-Length', mergedBuffer.length);
      res.send(mergedBuffer);
    } else {
      // Non-split file, download single file
      const message = await channel.messages.fetch(messageId);
      if (!message) {
        res.status(500).send('Message not found');
        return;
      }

      const attachment = message.attachments.first();
      if (!attachment) {
        res.status(500).send('Attachment not found');
        return;
      }
      const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
      const fileBuffer = Buffer.from(response.data);

      res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.name}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    }
  } catch (error) {
    console.error('Failed to fetch attachment:', error);
    res.status(500).send('Failed to fetch attachment');
  }
});

app.get('/download-merged/:messageId', async (req, res) => {
  const { messageId } = req.params;

  const file = uploadedFiles.find((file) => file.messageId === messageId);
  if (!file) {
    res.status(404).send('File not found');
    return;
  }

  const { channelId, attachments } = file;

  try {
    const channel = await bot.channels.fetch(channelId, { force: true });
    if (!channel) {
      res.status(500).send('Failed to fetch channel');
      return;
    }

    if (attachments.length > 1) {
      // Split file, download merged file
      const buffers = [];
      for (const attachment of attachments) {
        const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
        const fileBuffer = Buffer.from(response.data);
        buffers.push(fileBuffer);
      }

      const mergedBuffer = Buffer.concat(buffers);

      const attachment = attachments[0];
      res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.name}"`);
      res.setHeader('Content-Length', mergedBuffer.length);
      res.send(mergedBuffer);
    } else {
      res.status(400).send('File is not split');
    }
  } catch (error) {
    console.error('Failed to fetch attachment:', error);
    res.status(500).send('Failed to fetch attachment');
  }
});

app.post('/delete', express.json(), async (req, res) => {
  const { fileName } = req.body;

  if (fileName) {
    try {
      const files = db.prepare('SELECT messageId, channelId, chunkIndex FROM files WHERE name = ?').all(fileName);

      for (const file of files) {
        const { messageId, channelId, chunkIndex } = file;

        const channel = await bot.channels.fetch(channelId, { force: true });
        if (!channel) {
          console.error('Channel not found');
          res.status(500).send('Channel not found');
          return;
        }

        try {
          if (chunkIndex !== null) {
            // Split file, delete all chunks
            const chunks = db.prepare('SELECT messageId FROM files WHERE name = ? AND chunkIndex IS NOT NULL').all(fileName);

            for (const chunk of chunks) {
              const { messageId } = chunk;
              const message = await channel.messages.fetch(messageId);
              if (message) {
                await message.delete();
              }
              // Delete the chunk from the database
              db.prepare('DELETE FROM files WHERE messageId = ?').run(messageId);
            }
          } else {
            // Non-split file, delete the message directly
            const message = await channel.messages.fetch(messageId);
            if (message) {
              await message.delete();
            }
            // Delete the message from the database
            db.prepare('DELETE FROM files WHERE messageId = ?').run(messageId);
          }
        } catch (error) {
          console.error('Failed to delete message:', messageId, error);
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Failed to delete file:', fileName, error);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(400);
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  let fileName = file.originalname;
  const fileExists = db.prepare('SELECT name FROM files WHERE name = ?').get(fileName);
  if (fileExists) {
    const fileNumber = db.prepare('SELECT COUNT(*) AS count FROM files WHERE name LIKE ?').get(`${fileName.split('.')[0]}%`).count;
    fileName = `${fileName.split('.')[0]} (${fileNumber}).${fileName.split('.')[1]}`;
  }
  const fileType = file.mimetype;
  const channelId = '1071697670156066837'; // Replace with your desired channel ID

  try {
    const channel = await bot.channels.fetch(channelId);
    if (!channel) {
      console.error('Channel not found');
      res.status(500).send('Channel not found');
      return;
    }

    if (file.size <= chunkSize) {
      // Non-split file, store directly
      const message = await channel.send({
        content: `Uploaded file: ${fileName}`,
        files: [
          {
            attachment: file.buffer,
            name: fileName,
          },
        ],
      });

      db.prepare('INSERT INTO files (name, messageId, channelId) VALUES (?, ?, ?)').run(
        fileName,
        message.id,
        channelId
      );
    } else {
      // Split file, store message IDs for each chunk
      const chunks = [];
      const chunkCount = Math.ceil(file.size / chunkSize);

      for (let i = 0; i < chunkCount; i++) {
        const start = i * chunkSize;
        const end = start + chunkSize;
        const chunk = file.buffer.slice(start, end);

        const message = await channel.send({
          content: `Uploading file: ${fileName} - Chunk ${i + 1} of ${chunkCount}`,
          files: [
            {
              attachment: chunk,
              name: `${fileName}_part${i}.${fileType.split('/')[1]}`, // Unique name for each chunk
            },
          ],
        });

        chunks.push(message.id);

        const percent = ((i + 1) / chunkCount) * 100;
        res.write(`event: progress\ndata: ${percent.toFixed(2)}\n\n`);
      }

      chunks.forEach((messageId, chunkIndex) => {
        db.prepare(
          'INSERT INTO files (name, messageId, chunkIndex, channelId) VALUES (?, ?, ?, ?)'
        ).run(fileName, messageId, chunkIndex, channelId);
      });
    }

    res.write('event: complete\ndata: 100\n\n');
    res.end();
  } catch (error) {
    console.error('Failed to upload file:', error);
    res.status(500).send('Failed to upload file');
  }
});

// Listen on port 3000
server.listen(3000, () => {
  console.log('listening on *:3000');
});