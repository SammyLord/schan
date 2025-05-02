/**
 * Main JavaScript for sChan
 */

document.addEventListener('DOMContentLoaded', () => {
  // Load DOMPurify
  let purifyScript = document.createElement('script');
  purifyScript.src = '/js/lib/purify.min.js';
  document.head.appendChild(purifyScript);

  // Load markdown-it
  let markdownScript = document.createElement('script');
  markdownScript.src = '/js/lib/markdown-it.min.js';
  document.head.appendChild(markdownScript);

  // Wait for libraries to load before proceeding with features that need them
  Promise.all([
    new Promise(resolve => purifyScript.onload = resolve),
    new Promise(resolve => markdownScript.onload = resolve)
  ]).then(() => {
    initMediaPreviews();
    initPostPreviews();
    initSpecialUserHint();
    initAdminModFeatures();
  });
  
  // Media preview for uploads
  function initMediaPreviews() {
    // Handle image uploads
    const imageInputs = document.querySelectorAll('input[name="image"]');
    imageInputs.forEach(input => {
      input.addEventListener('change', function() {
        const preview = this.parentElement.querySelector('.image-preview');
        preview.innerHTML = '';
        
        if (this.files && this.files[0]) {
          const file = this.files[0];
          const reader = new FileReader();
          reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.maxWidth = '150px';
            img.style.maxHeight = '150px';
            img.style.margin = '10px 0';
            img.alt = ' ';
            preview.appendChild(img);
          }
          reader.readAsDataURL(file);
        }
      });
    });
    
    // Handle video uploads
    const videoInputs = document.querySelectorAll('input[name="video"]');
    videoInputs.forEach(input => {
      input.addEventListener('change', function() {
        const preview = this.parentElement.querySelector('.video-preview');
        preview.innerHTML = '';
        
        if (this.files && this.files[0]) {
          const file = this.files[0];
          const reader = new FileReader();
          reader.onload = function(e) {
            const video = document.createElement('video');
            video.src = e.target.result;
            video.style.maxWidth = '150px';
            video.style.maxHeight = '150px';
            video.style.margin = '10px 0';
            video.controls = true;
            preview.appendChild(video);
          }
          reader.readAsDataURL(file);
        }
      });
    });
  }
  
  // Post content preview with greentext and markdown support
  function initPostPreviews() {
    const contentTextareas = document.querySelectorAll('textarea[name="content"]');
    contentTextareas.forEach(textarea => {
      const previewDiv = textarea.parentElement.querySelector('.post-preview');
      
      // Create preview div if it doesn't exist
      if (!previewDiv) {
        const newPreview = document.createElement('div');
        newPreview.className = 'post-preview';
        newPreview.style.marginTop = '10px';
        newPreview.style.padding = '10px';
        newPreview.style.border = '1px solid #ddd';
        newPreview.style.borderRadius = '4px';
        newPreview.style.backgroundColor = '#f8f8f8';
        newPreview.style.wordWrap = 'break-word';
        newPreview.style.display = 'none';
        newPreview.innerHTML = '<div class="preview-header">Preview:</div>';
        textarea.parentElement.appendChild(newPreview);
      }
      
      // Initialize markdown-it with specific options (no image rendering)
      const md = window.markdownit({
        html: false,
        breaks: true,
        linkify: true,
        typographer: true
      });
      
      // Disable blockquote rendering to avoid conflict with greentext
      md.disable('blockquote');
      
      // Format content with greentext and markdown and sanitize
      function formatContent(content) {
        if (!content) return '';
        
        // Check if dependencies are loaded
        if (typeof DOMPurify === 'undefined' || typeof md === 'undefined') {
          console.error('Required libraries are not loaded yet');
          return '';
        }
        
        // Step 1: Apply markdown rendering to non-greentext lines
        // Modified to better handle greentext in markdown conversion
        const contentLines = content.split('\n');
        const preservedLines = [];
        
        for (let i = 0; i < contentLines.length; i++) {
          const line = contentLines[i];
          if (line.trim().startsWith('>')) {
            // Replace with a placeholder that won't be affected by markdown
            preservedLines.push({index: i, content: line});
            contentLines[i] = `%%GREENTEXT_PLACEHOLDER_${i}%%`;
          }
        }
        
        // Combine lines and apply markdown
        const markdownContent = md.render(contentLines.join('\n'));
        
        // Step 2: Replace placeholders with properly formatted greentext
        let finalContent = markdownContent;
        for (const line of preservedLines) {
          const placeholder = `%%GREENTEXT_PLACEHOLDER_${line.index}%%`;
          const greentextHtml = `<div class="greentext">${line.content.replace('>', '&gt;')}</div>`;
          finalContent = finalContent.replace(new RegExp(placeholder, 'g'), greentextHtml);
        }
        
        // Step 3: Final sanitization
        return DOMPurify.sanitize(finalContent, {
          ALLOWED_TAGS: ['span', 'p', 'br', 'div', 'strong', 'em', 'a', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'del'],
          ALLOWED_ATTR: ['class', 'href', 'target']
        });
      }
      
      // Update preview on input
      textarea.addEventListener('input', function() {
        const previewEl = this.parentElement.querySelector('.post-preview');
        const content = this.value.trim();
        
        if (content) {
          previewEl.style.display = 'block';
          const previewContent = previewEl.querySelector('.preview-content') || document.createElement('div');
          previewContent.className = 'preview-content';
          previewContent.innerHTML = formatContent(content);
          
          // Add to preview container if not already there
          if (!previewEl.querySelector('.preview-content')) {
            previewEl.appendChild(previewContent);
          }
        } else {
          previewEl.style.display = 'none';
        }
      });
    });
  }

  // Add a hint for special users
  function initSpecialUserHint() {
    // Add event handlers to name fields
    const nameInputs = document.querySelectorAll('input[name="name"]');
    
    // Function to decode base64 string
    function decodeBase64(str) {
      try {
        return atob(str);
      } catch (e) {
        console.error('Invalid base64 string:', str);
        return '';
      }
    }
    
    nameInputs.forEach(input => {
      input.addEventListener('change', function() {
        const name = this.value;
        
        // Get special names from server
        fetch('/api/special-names')
          .then(response => response.json())
          .then(data => {
            const specialNames = data.encodedNames.map(decodeBase64).filter(Boolean);
            
            // Add a hint next to the captcha for special users
            const captchaLabel = this.closest('form').querySelector('label[for="captcha"]');
            const specialHint = this.closest('form').querySelector('.special-captcha-hint');
            
            if (specialNames.includes(name)) {
              // If there's no hint element yet, create one
              if (!specialHint) {
                const hint = document.createElement('small');
                hint.className = 'special-captcha-hint';
                hint.style.display = 'block';
                hint.style.color = '#666';
                hint.style.marginTop = '2px';
                hint.textContent = 'Life, the Universe, and Everything, as well as a mysterious name, weed number, and nice number';
                captchaLabel.appendChild(hint);
              }
            } else {
              // Remove hint if user changes to non-special name
              if (specialHint) {
                specialHint.remove();
              }
            }
          })
          .catch(error => console.error('Error fetching special names:', error));
      });
    });
  }

  // Initialize admin and mod features
  function initAdminModFeatures() {
    // Add login forms to the page if they don't exist
    const loginContainer = document.createElement('div');
    loginContainer.id = 'admin-mod-login';
    loginContainer.style.position = 'fixed';
    loginContainer.style.top = '10px';
    loginContainer.style.right = '10px';
    loginContainer.style.zIndex = '1000';
    loginContainer.style.padding = '10px';
    loginContainer.style.backgroundColor = '#f8f8f8';
    loginContainer.style.border = '1px solid #ddd';
    loginContainer.style.borderRadius = '4px';
    loginContainer.style.display = 'none';

    loginContainer.innerHTML = `
      <div class="login-forms">
        <form id="admin-login-form">
          <h4>Admin Login</h4>
          <input type="password" name="adminPassword" placeholder="Admin Password" required>
          <button type="submit">Login as Admin</button>
        </form>
        <hr>
        <form id="mod-login-form">
          <h4>Moderator Login</h4>
          <input type="password" name="modPassword" placeholder="Moderator Password" required>
          <button type="submit">Login as Mod</button>
        </form>
      </div>
      <div class="admin-mod-controls" style="display: none;">
        <h4>Admin/Mod Controls</h4>
        <button id="logout-button">Logout</button>
      </div>
    `;

    document.body.appendChild(loginContainer);

    // Add login toggle button
    const toggleButton = document.createElement('button');
    toggleButton.textContent = '👤';
    toggleButton.style.position = 'fixed';
    toggleButton.style.top = '10px';
    toggleButton.style.right = '10px';
    toggleButton.style.zIndex = '1001';
    toggleButton.addEventListener('click', () => {
      loginContainer.style.display = loginContainer.style.display === 'none' ? 'block' : 'none';
    });
    document.body.appendChild(toggleButton);

    // Handle admin login
    document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = e.target.adminPassword.value;
      
      try {
        const response = await fetch('/login/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        if (data.success) {
          showAdminModControls();
          addAdminModFeatures();
        } else {
          alert('Login failed: ' + (data.error || 'Invalid credentials'));
        }
      } catch (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
      }
    });

    // Handle mod login
    document.getElementById('mod-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = e.target.modPassword.value;
      
      try {
        const response = await fetch('/login/mod', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        if (data.success) {
          showAdminModControls();
          addModFeatures();
        } else {
          alert('Login failed: ' + (data.error || 'Invalid credentials'));
        }
      } catch (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
      }
    });

    // Handle logout
    document.getElementById('logout-button').addEventListener('click', async () => {
      try {
        const response = await fetch('/logout', { method: 'POST' });
        const data = await response.json();
        if (data.success) {
          hideAdminModControls();
          removeAdminModFeatures();
        }
      } catch (error) {
        console.error('Logout error:', error);
        alert('Logout failed: ' + error.message);
      }
    });

    function showAdminModControls() {
      const loginForms = loginContainer.querySelector('.login-forms');
      const controls = loginContainer.querySelector('.admin-mod-controls');
      loginForms.style.display = 'none';
      controls.style.display = 'block';
    }

    function hideAdminModControls() {
      const loginForms = loginContainer.querySelector('.login-forms');
      const controls = loginContainer.querySelector('.admin-mod-controls');
      loginForms.style.display = 'block';
      controls.style.display = 'none';
      location.reload(); // Refresh to remove admin/mod features
    }

    function addAdminModFeatures() {
      // Add delete buttons to posts
      document.querySelectorAll('.post').forEach(post => {
        if (!post.querySelector('.delete-post-button')) {
          const deleteButton = document.createElement('button');
          deleteButton.className = 'delete-post-button';
          deleteButton.textContent = '🗑️ Delete';
          deleteButton.onclick = async () => {
            if (confirm('Are you sure you want to delete this post?')) {
              const postId = post.dataset.postId;
              try {
                const response = await fetch(`/admin/delete-post/${postId}`, { method: 'POST' });
                const data = await response.json();
                if (data.success) {
                  post.remove();
                }
              } catch (error) {
                console.error('Error deleting post:', error);
                alert('Failed to delete post');
              }
            }
          };
          post.appendChild(deleteButton);
        }
      });
    }

    function addModFeatures() {
      // Add mod-specific features (similar to admin features but with mod endpoints)
      document.querySelectorAll('.post').forEach(post => {
        if (!post.querySelector('.delete-post-button')) {
          const deleteButton = document.createElement('button');
          deleteButton.className = 'delete-post-button';
          deleteButton.textContent = '🗑️ Delete';
          deleteButton.onclick = async () => {
            if (confirm('Are you sure you want to delete this post?')) {
              const postId = post.dataset.postId;
              try {
                const response = await fetch(`/mod/delete-post/${postId}`, { method: 'POST' });
                const data = await response.json();
                if (data.success) {
                  post.remove();
                }
              } catch (error) {
                console.error('Error deleting post:', error);
                alert('Failed to delete post');
              }
            }
          };
          post.appendChild(deleteButton);
        }
      });
    }

    function removeAdminModFeatures() {
      // Remove all admin/mod features from the page
      document.querySelectorAll('.delete-post-button').forEach(button => button.remove());
    }
  }
}); 