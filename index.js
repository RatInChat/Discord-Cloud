// import required modules
import discord from 'discord.js';
import express from 'express';
import http from 'http';
import multer from 'multer';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
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
          <li>
            <a href="${downloadLink}" download>${name}</a>
            <span onclick="deleteFile('${name}')" style="cursor: pointer;">🗑️</span>
          </li>
        `;
      } else {
        // Non-split file, generate download link for single file
        const downloadLink = `/download/${messageId}`;
        return `
          <li>
            <a href="${downloadLink}" download>${name}</a>
            <span onclick="deleteFile('${name}')" style="cursor: pointer;">🗑️</span>
          </li>
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
  const indexHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Discloud</title>
        <link rel="stylesheet" href="styles.css">
        <script>
        function deleteFile(fileName) {
          fetch('/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fileName })
          })
            .then((response) => {
              if (response.ok) {
                window.location.reload();
              } else {
                console.error('Failed to delete file');
              }
            })
            .catch((error) => {
              console.error(error);
            });
        }        
        </script>
        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    </head>
    <body>
    <div class="sd-tabs" dark>
            <input class="sd-tab-radio" tabindex="1" name="tabs" type="radio" id="tabone" checked="checked">
            <label class="sd-tab-label" for="tabone">
            <div class="sd-tab-icon">
              <img src="./download.png" alt="icon">
            </div>
            <div class="sd-tab-desc">Uploads</div>
            <div class="sd-tab-icon sd-tab-close">
              <svg aria-hidden="true" data-prefix="fal" data-icon="times" xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 320 512" class="svg-inline--fa fa-times fa-w-10 fa-2x">
                  <path fill="currentColor"
                      d="M193.94 256L296.5 153.44l21.15-21.15c3.12-3.12 3.12-8.19 0-11.31l-22.63-22.63c-3.12-3.12-8.19-3.12-11.31 0L160 222.06 36.29 98.34c-3.12-3.12-8.19-3.12-11.31 0L2.34 120.97c-3.12 3.12-3.12 8.19 0 11.31L126.06 256 2.34 379.71c-3.12 3.12-3.12 8.19 0 11.31l22.63 22.63c3.12 3.12 8.19 3.12 11.31 0L160 289.94 262.56 392.5l21.15 21.15c3.12 3.12 8.19 3.12 11.31 0l22.63-22.63c3.12-3.12 3.12-8.19 0-11.31L193.94 256z" />
              </svg>
            </div>
            </label>
            <div class="sd-tab-content" tabindex="1">
              <div class="file-new-section">
              <div class="file-new-button" id="fileNewButton">
                <img src="./new.png" alt="new">
                <p>New</p>
                <img src="./downarrow.png" class="down-arrow" alt="downarrow">
              </div>
              <div class="file-new-dropdown">
                <div class="file-new-dropdown-item" onclick="uploadFileButton()">
                  <img src="./upload.png" alt="upload">
                  Upload Files
                </div>
                <div class="file-new-dropdown-item">
                  <img src="./folder.png" alt="folder">
                  Folder
                </div>
                <div id="upload-form">
                  <form enctype="multipart/form-data">
                    <input type="file" name="file" id="file-input">
                    <input type="button" value="Upload" style="background-color: #4CAF50; color: white; padding: 10px 20px; border: none; cursor: pointer; border-radius: 4px;" onclick="uploadFile()">
                  </form>
                </div>
                </div>
                <div class="line-breaker" />
                <h2>Uploaded Files</h2>
                <ul>
                  ${filesHTML}
                </ul>
                <section id="progress-section"></section>
            </div>
    </div>
  <script>
  const fileNewButton = document.getElementById('fileNewButton');
  const fileNewDropdown = document.querySelector('.file-new-dropdown');
  
  fileNewButton.addEventListener('click', toggleDropdown);
  
  function toggleDropdown() {
    fileNewDropdown.style.display = fileNewDropdown.style.display === 'block' ? 'none' : 'block';
  }

  document.addEventListener('click', function(event) {
    const isClickInsideDropdown = fileNewDropdown.contains(event.target);
    const isClickInsideButton = fileNewButton.contains(event.target);
  
    if (!isClickInsideDropdown && !isClickInsideButton) {
      fileNewDropdown.style.display = 'none';
    }
  });

  function uploadFileButton() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.click();
  
    fileInput.addEventListener('change', (event) => {
      const selectedFile = event.target.files[0];
      if (selectedFile) {
        uploadFile(selectedFile);
      }
    });
  }
  
  const progressSection = document.getElementById('progress-section');

  function createProgressBar(id, title) {
    const progressDiv = document.createElement('div');
    progressDiv.setAttribute('id', \`\${id}-div\`);
    progressDiv.innerHTML = \`
      <p>\${title}</p>
      <div class="progress-bar progress-bar-show-percent">
        <div id="\${id}-progress-bar" class="progress-bar-filled" style="width: 0" data-filled="Progress 0%"></div>
      </div>
      \`;
    progressSection.appendChild(progressDiv);
  }

  function updateProgressBar(id, percent) {
    const progressBar = document.getElementById(\`\${id}-progress-bar\`);
    progressBar.style.width = \`\${percent}%\`;
    progressBar.setAttribute('data-filled', \`Progress \${percent}%\`);
  }

  function deleteProgressBar(id, timeout = 3000) {
    const progressDiv = document.getElementById(\`\${id}-div\`);
    setTimeout(() => progressSection.removeChild(progressDiv), timeout);
  }

  function makeid(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i += 1) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }

  function uploadFile(file) {
    if (!file) {
      return;
    }
  
    const id = makeid(20);
    const formData = new FormData();
    formData.append('file', file);
  
    createProgressBar(id, \`Uploading \${file.name}\`);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload');
  
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100;
        updateProgressBar(id, Math.floor(progress));
      }
    });
  
    xhr.onload = async () => {
      deleteProgressBar(id);
    };
  
    xhr.onerror = async () => {
      deleteProgressBar(id);
    };
  
    xhr.send(formData);
  }  
</script>
    </body>
    </html>
  `;

  res.send(indexHTML);
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