// import required modules
import discord from 'discord.js';
import express from 'express';
import http from 'http';
import multer from 'multer';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
dotenv.config();
import fileSchema from './modals/file-schema.js';

// Set up Discord bot
const bot = new discord.Client({
  intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent']
});

bot.on('ready', async () => {
  console.log('Bot is ready');
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('Database is ready!');
  await fetchUploadedFiles();
});

bot.login(process.env.TOKEN);

const app = express();
const server = http.createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use(express.static(join(__dirname, 'public')));
app.use('./favicon.ico', express.static(join(__dirname, 'public/favicon.ico')));
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: Infinity } // Set the file size limit to Infinity
});

const uploadedFiles = [];
const folders = [];
const chunkSize = 25 * 1024 * 1024;
async function fetchUploadedFiles() {
  try {
    const files = await fileSchema.find({});
    uploadedFiles.length = 0;
    folders.length = 0;

    for (const file of files) {
      const { _id, name, messageId, chunkIndex, channelId, folderId, isFolder } = file;

      if (isFolder) {
        folders.push({
          id: _id,
          name,
          messageId,
          channelId,
          folderId,
        });
      } else {
        let attachments = [];
        if (chunkIndex !== null) {
          // Split file, fetch attachments for each chunk
          const chunks = await fileSchema.find({ name, chunkIndex: { $ne: null } });

          for (const chunk of chunks) {
            const chunkMessage = await bot.channels.fetch(channelId).then((channel) => channel.messages.fetch(chunk.messageId));
            if (chunkMessage && chunkMessage.attachments && chunkMessage.attachments.size > 0) {
              attachments.push(chunkMessage.attachments.first());
            }
          }
        } else {
          // Non-split file, fetch attachment directly
          const message = await bot.channels.fetch(channelId).then((channel) => channel.messages.fetch(messageId));
          if (message && message.attachments && message.attachments.size > 0) {
            attachments.push(message.attachments.first());
          }
        }

        uploadedFiles.push({
          id: _id,
          name,
          messageId,
          channelId,
          attachments,
          chunkIndex,
        });
      }
    }

    generateFilesHTML();
  } catch (error) {
    console.error("Failed to fetch files from MongoDB:", error);
  }
}

function generateFilesHTML() {
  const mergedFiles = new Map(); // Map to store merged files

  const allFiles = [...uploadedFiles, ...folders];

  for (const file of allFiles) {
    const { name, messageId, attachments, chunkIndex } = file;

    if (attachments) {
      if (!mergedFiles.has(messageId)) {
        mergedFiles.set(messageId, {
          name,
          messageId,
          attachments: [attachments[0]],
          chunkIndex
        });
      } else {
        mergedFiles.get(messageId).attachments.push(attachments[0]);
      }
    } else {
      if (!mergedFiles.has(messageId)) {
        mergedFiles.set(messageId, {
          name,
          messageId,
          attachments: [],
          chunkIndex
        });
      }
    }
  }

  return Array.from(mergedFiles.values())
    .map((file) => {
      const { name, messageId, attachments, chunkIndex } = file;

      if (chunkIndex > 0) {
        return '';
      }
      if (attachments.length > 1) {
        const downloadLink = `/download-merged/${messageId}`;
        return `
          <div class="file" data-name="${name}" data-link="${downloadLink}" onclick="handleFileFocus(event)">
            <i class="fas ${getIconForFileType(name)}"></i> <!-- Dynamic icon -->
            ${name}
          </div>
        `;
      } else if (attachments.length === 1) {
        const downloadLink = `/download/${messageId}`;
        return `
          <div class="file" data-name="${name}" data-link="${downloadLink}" onclick="handleFileFocus(event)">
            <i class="fas ${getIconForFileType(name)}"></i> <!-- Dynamic icon -->
            <p class="file-name">${name}</p>
          </div>
        `;
      } else if (attachments.length === 0) {
        return `
          <div class="file" data-name="${name}" onclick="handleFileFocus(event)" ondblclick="handleFolderDoubleClick(event)">
            <img src="./folder.png" alt="folder" />
            <p class="file-name">${name}</p>
          </div>
        `;
      }

      // Return an empty string for any other cases
      return '';
    })
    .join('');
}

function getIconForFileType(fileName) {
  if (!fileName) {
    return 'fa-file';
  }

  const fileExtension = fileName.split('.').pop().toLowerCase();

  switch (fileExtension) {
    case 'jpg':
    case 'jpeg':
    case 'png':
      return 'fa-file-image';
    case 'mp4':
    case 'avi':
      return 'fa-file-video';
    case 'pdf':
      return 'fa-file-pdf';
    case 'txt':
      return 'fa-file-alt';
    case 'doc':
    case 'docx':
      return 'fa-file-word';
    case 'xls':
    case 'xlsx':
      return 'fa-file-excel';
    case 'ppt':
    case 'pptx':
      return 'fa-file-powerpoint';
    case 'zip':
    case 'rar':
    case '7z':
      return 'fa-file-archive';
    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'flac':
      return 'fa-file-audio';
    // Add more cases for other file types as needed
    default:
      return 'fa-file'; // Default icon class for unknown file types
  }
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

app.get('/download/:messageId/:folderId?', async (req, res) => {
  const { messageId, folderId } = req.params;

  if (!messageId) {
    res.status(400).send('Message ID not specified');
    return;
  }

  if (folderId) {
    const folder = await fileSchema.findOne({ messageId: folderId });
    if (!folder) {
      res.status(404).send('Folder not found');
      return;
    }

    const file = folder.attachments.find((file) => file.messageId === messageId);
    
    if (!file) {
      res.status(404).send('File not found');
      return;
    }

    const { channelId } = file;

    try {
      const channel = await bot.channels.fetch(channelId, { force: true });
      if (!channel) {
        res.status(500).send('Failed to fetch channel');
        return;
      }
      // fetch file from discord
      const message = await channel.messages.fetch(messageId);
      if (!message) {
        res.status(404).send('File not found');
        return;
      }
      const attachment = message.attachments.first();
      if (!attachment) {
        res.status(404).send('File not found');
        return;
      }
      // send file to client
      const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
      const fileBuffer = Buffer.from(response.data);
      res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.name}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    } catch (error) {
      console.error('Failed to fetch attachment:', error);
      res.status(500).send('Failed to fetch attachment');
    }

    return;
  }
  
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
      res.status(400).send('File is a folder');
    }
  } catch (error) {
    console.error('Failed to fetch attachment:', error);
    res.status(500).send('Failed to fetch attachment');
  }
});

app.get('/download-merged/:messageId/:folderId?', async (req, res) => {
  const { messageId, folderId } = req.params;
  if (!messageId) {
    res.status(400).send('Message ID not specified');
    return;
  }

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

    if (attachments && attachments.length > 1) {
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
      res.status(400).send('File is a folder');
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
      const filesToDelete = await fileSchema.find({ name: fileName });

      for (const file of filesToDelete) {
        const { _id, messageId, channelId, chunkIndex, folderId } = file;

        const channel = await bot.channels.fetch(channelId, { force: true });
        if (!channel) {
          console.error('Channel not found');
          res.status(500).send('Channel not found');
          return;
        }

        try {
          if (folderId) {
            // Folder file, delete all associated files
            const folderFiles = await fileSchema.find({ folderId: folderId });

            for (const folderFile of folderFiles) {
              const { messageId } = folderFile;
              const message = await channel.messages.fetch(messageId);
              if (message) {
                await message.delete();
              }
              // Delete the file from the database
              await fileSchema.findByIdAndDelete(folderFile._id);
            }
          } else if (chunkIndex !== null) {
            // Split file, delete all chunks
            const chunks = await fileSchema.find({ name: fileName, chunkIndex: { $ne: null } });

            for (const chunk of chunks) {
              const { messageId } = chunk;
              const message = await channel.messages.fetch(messageId);
              if (message) {
                await message.delete();
              }
              // Delete the chunk from the database
              await fileSchema.findByIdAndDelete(chunk._id);
            }
          } else {
            // Non-split file, delete the message directly
            const message = await channel.messages.fetch(messageId);
            if (message) {
              await message.delete();
            }
            // Delete the message from the database
            await fileSchema.findByIdAndDelete(_id);
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

app.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  let fileName = file.originalname;
  const fileExists = await fileSchema.findOne({ name: fileName });
  if (fileExists) {
    const fileNumber = await fileSchema.countDocuments({ name: new RegExp(`^${fileName.split(".")[0]}`, "i") });
    fileName = `${fileName.split(".")[0]} (${fileNumber}).${fileName.split(".")[1]}`;
  }

  const fileType = file.mimetype;
  const folderName = req.body.folderName || null;
  const channelId = process.env.CHANNEL_ID;

  try {
    const channel = await bot.channels.fetch(channelId);
    if (!channel) {
      console.error("Channel not found");
      res.status(500).send("Channel not found");
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
  
        if (folderName) {
          const folder = await fileSchema.findOne({ name: folderName });
          if (folder) {
            // Folder exists, add the file to the folder
            folder.attachments.push({
              name: fileName,
              messageId: message.id,
              channelId: channelId,
              attachments: [
                {
                  contentType: fileType,
                  name: fileName,
                },
              ],
            });
            await folder.save();
          } else {
            // Folder doesn't exist, just upload the file
            const newFile = new fileSchema({
              name: fileName,
              messageId: message.id,
              channelId: channelId,
              attachments: [
                {
                  contentType: fileType,
                  name: fileName,
                },
              ],
            });
            await newFile.save();
          }
        } else {
          // No folder specified, just upload the file
          const newFile = new fileSchema({
            name: fileName,
            messageId: message.id,
            channelId: channelId,
            attachments: [
              {
                contentType: fileType,
                name: fileName,
              },
            ],
          });
          await newFile.save(); 
        }
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
              name: `${fileName}_part${i}.${fileType.split("/")[1]}`, // Unique name for each chunk
            },
          ],
        });

        chunks.push(message.id);

        const percent = ((i + 1) / chunkCount) * 100;
        res.write(`event: progress\ndata: ${percent.toFixed(2)}\n\n`);
      }
      if (folderName) {
        const folder = await fileSchema.findOne({ name: folderName });
        if (folder) {
          // Folder exists, add the file to the folder
          chunks.forEach((chunk, index) => {
            folder.attachments.push({
              name: fileName,
              messageId: chunk,
              channelId: channelId,
              chunkIndex: index,
              attachments: [
                {
                  contentType: fileType,
                  name: fileName,
                },
              ],
            });
          });
          await folder.save();
        } else {
          // Folder doesn't exist, just upload the file
          chunks.forEach((chunk, index) => {
            const newFile = new fileSchema({
              name: fileName,
              messageId: chunk,
              chunkIndex: index,
              channelId: channelId,
              chunkIndex: index,
              attachments: [
                {
                  contentType: fileType,
                  name: fileName,
                },
              ],
            });
            newFile.save();
          }
          );
        }
      } else {
        chunks.forEach((chunk, index) => {
          const newFile = new fileSchema({
            name: fileName,
            messageId: chunk,
            chunkIndex: index,
            channelId: channelId,
            chunkIndex: index,
            attachments: [
              {
                contentType: fileType,
                name: fileName,
              },
            ],
          });
          newFile.save();
        });
      }
    }

    res.write("event: complete\ndata: 100\n\n");
    res.status(200).end();
  } catch (error) {
    console.error("Failed to upload file:", error);
    res.status(500).send("Failed to upload file");
  }
});

app.post("/create-folder", express.json(), async (req, res) => {
  const { folderName } = req.body;
  const channelId = process.env.CHANNEL_ID;

  try {
    const channel = await bot.channels.fetch(channelId);
    if (!channel) {
      console.error("Channel not found");
      res.status(500).send("Channel not found");
      return;
    }

    const message = await channel.send({
      content: `Created folder: ${folderName}`,
    });

    const newFolder = new fileSchema({
      name: folderName,
      messageId: message.id,
      channelId: channelId,
      isFolder: true,
    });

    await newFolder.save();

    res.sendStatus(200);
  } catch (error) {
    console.error("Failed to create folder:", error);
    res.status(500).send("Failed to create folder");
  }
});

app.get('/folders/:folderName', handleFolderDoubleClick);

async function handleFolderDoubleClick(req, res) {
  const folderName = req.params.folderName;
  const folderContents = await fileSchema.find({ name: folderName });

  if (folderContents) {
    const folderId = folderContents[0].messageId;
    const folderContentsHTML = folderContents[0].attachments ? generateFolderContentsHTML(folderContents[0].attachments, folderId) : '';
    res.send(folderContentsHTML);
  } else {
    res.status(404).send('Folder not found');
  }
}

function generateFolderContentsHTML(folderContents, folderId) {
  return folderContents.map((file) => {
    const { name, messageId, attachments, chunkIndex } = file;

    if (chunkIndex > 0) {
      return '';
    }

    if (attachments.length > 1) {
      // Split file, generate download link for merged file
      const downloadLink = `/download-merged/${messageId}/${folderId}`;
      return `
        <div class="file" data-name="${name}" data-link="${downloadLink}" onclick="handleFileFocus(event)">
          <i class="fas ${getIconForFileType(name)}"></i> <!-- Dynamic icon -->
          ${name}
        </div>
      `;
    } else if (attachments.length === 1) {
      // Non-split file, generate download link for single file
      const downloadLink = `/download/${messageId}/${folderId}`;
      return `
        <div class="file" data-name="${name}" data-link="${downloadLink}" onclick="handleFileFocus(event)">
          <i class="fas ${getIconForFileType(name)}"></i> <!-- Dynamic icon -->
          <p class="file-name">${name}</p>
        </div>
      `;
    } else if (attachments.length === 0) {
      // Folder
      return `
        <div class="file" data-name="${name}" onclick="handleFileFocus(event)">
          <img src="./folder.png" alt="folder" />
          <p class="file-name">${name}</p>
        </div>
      `;
    }

    // Return an empty string for any other cases
    return '';
  }).join('');
}
// Listen on port 3000
server.listen(3000, () => {
  console.log('listening on *:3000');
});