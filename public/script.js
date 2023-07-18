new SimpleBar(document.getElementById('simple-bar'), { autoHide: false });
const fileNewButton = document.getElementById('fileNewButton');
const fileNewDropdown = document.querySelector('.file-new-dropdown');

fileNewButton.addEventListener('click', toggleDropdown);

function toggleDropdown() {
fileNewDropdown.style.display = fileNewDropdown.style.display === 'block' ? 'none' : 'block';
const path = document.querySelector('.path-box');
const paths = path.querySelectorAll('.path');

if (paths.length > 2) {
  const createFolder = document.querySelector('.folder');
  createFolder.classList.add('disabled');
}
}
let focusedFile = null;

function handleFileFocus(event) {
const fileElement = event.currentTarget;

// Remove focus from previously focused file
if (focusedFile) {
  focusedFile.classList.remove('file-focused');
  const items = document.querySelectorAll('.file-new-item');
  items.forEach((item) => {
    item.style.opacity = '0.5';
  });
}

// Apply focus to the clicked file
fileElement.classList.add('file-focused');
focusedFile = fileElement;

const items = document.querySelectorAll('.file-new-item');
items.forEach((item) => {
  item.style.opacity = '1';
});

// Prevent event propagation to avoid triggering other click events
event.stopPropagation();
}  

document.addEventListener('click', handleDocumentClick);

function handleDocumentClick(event) {
const filesSection = document.querySelector('.files-section');
const isClickInsideFiles = filesSection.contains(event.target);

if (!isClickInsideFiles && focusedFile) {
  focusedFile.classList.remove('file-focused');
  const items = document.querySelectorAll('.file-new-item');
  items.forEach((item) => {
    item.style.opacity = '0.5';
  });
  focusedFile = null;
}
}  
window.addEventListener('beforeunload', () => {
document.removeEventListener('click', handleDocumentClick);
});
const config = {
    FORBID_TAGS: ['script'],
  };

  function textBox() {
    const pathBox = document.querySelector('.path-box');
    const path = pathBox.querySelector('.path');
    if (!path) return;

    const textBox = document.createElement('input');
    textBox.id = 'pathInput';
    textBox.type = 'text';
    textBox.value = path.textContent || path.innerText;
    pathBox.replaceChild(textBox, path);
    textBox.focus();

    textBox.addEventListener('keyup', handleEnterKey);
    pathBox.removeEventListener('click', textBoxClick);
    pathBox.classList.add('input-active');
  }

  function handleEnterKey(event) {
    if (event.key === 'Enter') {
      const sanitizedValue = DOMPurify.sanitize(event.target.value, config);
      const path = document.createElement('span');
      path.className = 'path';
      path.innerHTML = sanitizedValue;
      const textBox = document.querySelector('#pathInput');
      const pathBox = document.querySelector('.path-box');
      pathBox.replaceChild(path, textBox);
      pathBox.addEventListener('click', textBoxClick);
      pathBox.classList.remove('input-active');
    }
  }

  function textBoxClick(event) {
    const pathBox = document.querySelector('.path-box');
    const textBox = document.querySelector('#pathInput');
    const isClickInsidePathBox = pathBox.contains(event.target);
    const isClickInsideTextBox = textBox.contains(event.target);

    if (!isClickInsidePathBox && !isClickInsideTextBox) {
      const sanitizedValue = DOMPurify.sanitize(textBox.value, config);
      const path = document.createElement('span');
      path.className = 'path';
      path.innerHTML = sanitizedValue;
      pathBox.replaceChild(path, textBox);
      pathBox.addEventListener('click', textBoxClick);
      pathBox.classList.remove('input-active');
    }
  }

  const pathBox = document.querySelector('.path-box');
  pathBox.addEventListener('click', textBoxClick);

document.addEventListener('click', function(event) {
const isClickInsideDropdown = fileNewDropdown.contains(event.target);
const isClickInsideButton = fileNewButton.contains(event.target);

if (!isClickInsideDropdown && !isClickInsideButton) {
  fileNewDropdown.style.display = 'none';
}
});
const fileNewTrashIcon = document.querySelector('.trash');
fileNewTrashIcon.addEventListener('click', deleteFocusedFile);

function deleteFocusedFile() {
const focusedFile = document.querySelector('.file.file-focused');
if (focusedFile) {
  const name = focusedFile.getAttribute('data-name');
  const pathBox = document.querySelector('.path-box');
  const paths = pathBox.querySelectorAll('.path');
  let folderName = paths[paths.length - 1].textContent;
  let parentFolderNameUnparsed = paths[paths.length - 2];
  let parentFolderName = parentFolderNameUnparsed ? parentFolderNameUnparsed.textContent : null;

  if (folderName === 'uploads') {
    folderName = null;
    parentFolderName = null;
  }

  deleteFile(name, folderName || null, parentFolderName || null);
}
}

function deleteFile(fileName, folderName = null, parentFolderName = null) {
  fetch('/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileName, folderName, parentFolderName })
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

function uploadFileButton() {
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.click();

fileInput.addEventListener('change', (event) => {
  const selectedFile = event.target.files;
  for (let i = 0; i < selectedFile.length; i += 1) {
    let pathBox = document.querySelector('.path-box');
    const paths = pathBox.querySelectorAll('.path');
    let folderName = paths[paths.length - 1].textContent;
    let parentFolderNameUnparsed = paths[paths.length - 2];
    let parentFolderName = parentFolderNameUnparsed ? parentFolderNameUnparsed.textContent : null;
    
    if (folderName === 'uploads') {
      folderName = null;
      parentFolderName = null;
    }

    uploadFile(selectedFile[i], folderName || null, parentFolderName || null);
  }
});
}

const progressSection = document.getElementById('progress-section');

function createProgressBar(id, title) {
const progressDiv = document.createElement('div');
progressDiv.setAttribute('id', `${id}-div`);
progressDiv.innerHTML = `
  <p>${title}</p>
  <div class="progress-bar progress-bar-show-percent">
    <div id="${id}-progress-bar" class="progress-bar-filled" style="width: 0" data-filled="Progress 0%"></div>
  </div>
  `;
progressSection.appendChild(progressDiv);
}

function updateProgressBar(id, percent) {
const progressBar = document.getElementById(`${id}-progress-bar`);
progressBar.style.width = `${percent}%`;
progressBar.setAttribute('data-filled', `Progress ${percent}%`);
}

function deleteProgressBar(id, timeout = 3000) {
const progressDiv = document.getElementById(`${id}-div`);
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
async function uploadFile(file, folderName, parentFolderName) {
  if (!file) {
    return;
  }

  const id = makeid(20);
  const formData = new FormData();
  formData.append('file', file);

  if (folderName) {
    formData.append("folderName", folderName);
  } 
  if (parentFolderName) {
    formData.append("parentFolderName", parentFolderName);
  }

  // createProgressBar(id, `Uploading ${file.name}`);

  try {
    await fetch('/upload', {
      method: 'POST',
      body: formData,
    }).then((response) => {
        if (response.ok) {
          window.location.reload();
        } else {
          console.error('Failed to delete file');
        }
    })

    // if (response.ok) {
    //   // File upload was successful
    //   deleteProgressBar(id);
    // } else {
    //   // Handle error if needed
    //   deleteProgressBar(id);
    // }
  } catch (error) {
    console.error('Error uploading file:', error);
    // Handle error if needed
    deleteProgressBar(id);
  }
}

function createFolder() {
  const folderButton = document.querySelector('.folder');
  if (folderButton.classList.contains('disabled')) return;

  const filesSection = document.querySelector('.files-section');
  const folder = document.createElement('div');
  folder.className = 'file';
  const folderIcon = document.createElement('img');
  folderIcon.src = './folder.png';
  folderIcon.alt = 'folder';
  folder.appendChild(folderIcon);
  fileNewDropdown.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'file-name-input';
  input.value = 'New Folder';
  folder.appendChild(input);
  filesSection.appendChild(folder);
  input.focus();
  input.addEventListener('keyup', handleFolderNameInput);
  document.addEventListener('click', handleFolderNameInput);
}
function handleFolderNameInput(event) {
  const input = document.querySelector('.file-name-input');
  const file = input.closest('.file');
  if (event.target.classList.contains('folder')) return;
  if (file) {
    const filesSection = document.querySelector('.files-section');
    const isClickOutsideFolderNameInput = !file.contains(event.target);
    if (event.key === 'Enter' || isClickOutsideFolderNameInput) {
      const sanitizedValue = DOMPurify.sanitize(input.value, config);
      const fileName = document.createElement('p');
      fileName.className = 'file-name';
      fileName.innerHTML = sanitizedValue;
      file.replaceChild(fileName, input);
      input.removeEventListener('keyup', handleFolderNameInput);
      document.removeEventListener('click', handleFolderNameInput);
      // if is in folder
      const pathBox = document.querySelector('.path-box');
      const paths = pathBox.querySelectorAll('.path');
      const parentFolderName = paths[paths.length - 1].textContent;
      
      if (parentFolderName) {
        fetch('/create-folder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ folderName: sanitizedValue, parentFolderName }),
        })
          .then((response) => {
            if (response.ok) {
              window.location.reload();
            } else {
              console.error('Failed to create folder');
            }
          })
          .catch((error) => {
            console.error('Error creating folder:', error);
          });
      } else {
        fetch('/create-folder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ folderName: sanitizedValue }),
        })
          .then((response) => {
            if (response.ok) {
              window.location.reload();
            } else {
              console.error('Failed to create folder');
            }
          })
          .catch((error) => {
            console.error('Error creating folder:', error);
          });
      }
    }
 
  }
}
function share() {
  const focusedFile = document.querySelector('.file.file-focused');
  if (focusedFile) {
    const fileName = focusedFile.getAttribute('data-name');
    const fileLink = focusedFile.getAttribute('data-link');
    let shareUrl = `${window.location.origin}${fileLink}`;

    // Create a modal element
    const modal = document.createElement('div');
    modal.className = 'modal';

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    // Create share box
    const shareBox = document.createElement('div');
    shareBox.className = 'share-box';

    // Create share text
    const shareText = document.createElement('p');
    shareText.textContent = 'Copy this link to share:';

    // Create share URL input
    const shareUrlInput = document.createElement('input');
    shareUrlInput.className = 'share-url-input';
    shareUrlInput.type = 'text';
    shareUrlInput.value = shareUrl;

    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy';
    copyButton.addEventListener('click', () => {
      shareUrlInput.select();
      document.execCommand('copy');
      copyButton.textContent = 'Copied!';
      setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 2000);
    });

    // Append share text and URL input to share box
    modalContent.appendChild(shareText);
    shareBox.appendChild(shareUrlInput);

    // Append copy button to share box
    shareBox.appendChild(copyButton);

    // Append share box to modal content
    modalContent.appendChild(shareBox);

    // Create download link
    const downloadLink = document.createElement('p');
    downloadLink.innerHTML = `or <a href="${shareUrl}">download</a>`;

    // Append download link to modal content
    modalContent.appendChild(downloadLink);

    // Append modal content to modal
    modal.appendChild(modalContent);

    // Append modal to document body
    document.body.appendChild(modal);

    // Remove the modal when clicking outside of it
    window.addEventListener('click', (event) => {
      if (event.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }
}
async function handleFolderDoubleClick(event) {
    const folderElement = event.currentTarget;
    const folderName = folderElement.getAttribute('data-name');
    
    if (focusedFile) {
      focusedFile.classList.remove('file-focused');
      const items = document.querySelectorAll('.file-new-item');
      items.forEach((item) => {
        item.style.opacity = '0.5';
      });
      focusedFile = null;
    }
    const home = document.querySelector('.home');
    
    if (home) {
      home.classList.remove('selected');
    }
    // check if its a folder folder
    const path = document.querySelector('.path-box');
    const paths = path.querySelectorAll('.path');

    if (paths.length > 1) {
      const parentFolderName = paths[paths.length - 1].textContent;
      await fetch(`/folders/${folderName}/${parentFolderName}`)
        .then(async (response) => await response.text())
        .then(async (folderContentsHTML) => {
          const folderContentsContainer = document.querySelector('.files-section');
          folderContentsContainer.innerHTML = folderContentsHTML;
          const path = document.querySelector('.path-box');
          path.innerHTML += `
              <img src="./right.png" class="small bold right-arrow" alt="right">
              <span class="path">${folderName}</span>
          `;
        })
        .catch((error) => {
          console.error('Error fetching folder contents:', error);
        });
    } else {
      await fetch(`/folders/${folderName}`)
        .then(async (response) => await response.text())
        .then(async (folderContentsHTML) => {
          const folderContentsContainer = document.querySelector('.files-section');
          folderContentsContainer.innerHTML = folderContentsHTML;
          const path = document.querySelector('.path-box');
          path.innerHTML += `
              <img src="./right.png" class="small bold right-arrow" alt="right">
              <span class="path">${folderName}</span>
          `;
        })
        .catch((error) => {
          console.error('Error fetching folder contents:', error);
        });
    }
}

function home() {
  const path = document.querySelector('.path-box');
  path.innerHTML = `
    <img src="./download.png" alt="uploads">
    <img src="./right.png" class="small bold right-arrow" alt="right">
    <span class="path">uploads</span>
  `;

  let html = fetch('/reset');
  html.then((response) => {
    return response.text();
  }
  ).then((html) => {
    const folderContentsContainer = document.querySelector('.files-section');
    folderContentsContainer.innerHTML = html;
  }
  ).catch((error) => {
    console.error('Error fetching folder contents:', error);
  }
  );
}