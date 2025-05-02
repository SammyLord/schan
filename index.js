/**
 * sChan - A 4chan-like imageboard using Express.js and quick.db
 */

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { QuickDB } = require('quick.db');
const moment = require('moment');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const sharp = require('sharp'); // Add Sharp for image compression
const MarkdownIt = require('markdown-it'); // Add markdown-it for markdown formatting
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create DOMPurify instance (requires a window object via JSDOM)
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Initialize markdown-it with specific options (no image rendering)
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true,
  // Disable image rendering and blockquotes
  disable: ['image', 'blockquote']
});

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

const defaultBoards = [
  { id: 'b', name: 'Random', description: 'Random discussion' },
  { id: 'a', name: 'Anime', description: 'Anime & Manga discussion' },
  { id: 'sanrio', name: 'Sanrio', description: 'Discussion about Sanrio characters, cartoons, products, and their universes' },
  { id: 'vocal', name: 'Vocaloid-like', description: "Discussion about Vocal and Singing software, characters, songs, products, and their universes" },
  { id: 'pol', name: 'Politics', description: 'Political discussion' },
  { id: 'g', name: 'Technology', description: 'Technology discussion' },
  { id: 'p', name: 'Photography', description: 'Photography discussion' },
  { id: 'hen', name: '*NSFW* Hentai', description: '*NSFW* First-party porn of Anime and Manga characters' },
  { id: 'r34', name: '*NSFW* r34', description: "*NSFW* If it exists, there's porn of it. Third-party porn of cartoons, anime, and manga." },
  { id: 'coom', name: '*NSFW* Coomer Zone', description: '*NSFW* Porn of anything and everything legal, including real people.' },
  { id: 'wtf', name: '*NSFW* WTF', description: '*NSFW* Shit that makes you mad, sad, or just makes you go "wtf"' },
  { id: 'foss', name: 'Open Source', description: 'Talk about open source projects and software' },
  { id: 'sci', name: 'Science', description: 'Science discussion' },
  { id: 'art', name: 'Art', description: 'Art discussion' },
  { id: 'moozie', name: 'Music', description: 'Music discussion' },
  { id: 'srcleak', name: 'Source Code Leaks', description: 'Leaks of source code, programming documentation, and other technical documents' },
  { id: 'leak', name: 'Random Leaks', description: 'Leaks of anything and everything, including but not limited to source code.' },
  { id: 'food', name: 'Food', description: 'Food discussion' },
  { id: 'game', name: 'Video Games', description: 'Video Game discussion' },
  { id: 'appl', name: 'Apple', description: 'Talk about the joys of Apple products, services, and the company.' }
];

// Initialize quick.db
const db = new QuickDB();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'image') {
    // Only accept image files for the image field
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for the image field!'));
    }
  } else if (file.fieldname === 'video') {
    // Only accept video files for the video field
    const filetypes = /mp4|webm/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed for the video field!'));
    }
  } else {
    cb(new Error('Unexpected field'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 18 * 1024 * 1024 }, // Use env var or default to 18MB
  fileFilter: fileFilter
});

// Set up middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'schan-secret-key',
  resave: false,
  saveUninitialized: true
}));

// Set the view engine to ejs
app.set('view engine', 'ejs');

// Make sure uploads directory exists
if (!fs.existsSync('./public/uploads')) {
  fs.mkdirSync('./public/uploads', { recursive: true });
}

// Generate a captcha and store it in session
function generateCaptcha(req) {
  const characters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  // Store in session
  req.session.captchaCode = result;
  return result;
}

// Function to format post content with greentext and markdown support
function formatPostContent(content) {
  if (!content) return '';
  
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

// Function to compress and process uploaded images
const processImage = async (file) => {
  if (!file) return null;
  
  const imageBuffer = fs.readFileSync(file.path);
  const compressedFilename = `compressed_${file.filename}`;
  const outputPath = path.join('public/uploads/', compressedFilename);
  
  // Check if the file is a GIF - Sharp doesn't support GIF animation so we'll skip compression
  if (file.mimetype === 'image/gif') {
    return { path: `/uploads/${file.filename}`, type: 'image' };
  }
  
  try {
    // Get image metadata to calculate 25% size
    const metadata = await sharp(imageBuffer).metadata();
    const newWidth = Math.round(metadata.width * 0.42);
    const newHeight = Math.round(metadata.height * 0.42);
    
    // Initialize Sharp with the image buffer and resize to 42% of original dimensions
    let sharpImage = sharp(imageBuffer)
      .resize(newWidth, newHeight); // Shrink to 42% of original size
    
    // Apply format-specific compression
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
      sharpImage = sharpImage.jpeg({ quality: 69 });
    } else if (file.mimetype === 'image/png') {
      sharpImage = sharpImage.png({ compressionLevel: 8, quality: 74 });
    } else if (file.mimetype === 'image/webp') {
      sharpImage = sharpImage.webp({ quality: 77 });
    }
    
    // Save the compressed image
    await sharpImage.toFile(outputPath);
    
    // Delete the original file
    fs.unlinkSync(file.path);
    
    return { path: `/uploads/${compressedFilename}`, type: 'image' };
  } catch (error) {
    console.error('Error compressing image:', error);
    // Return the original image path if compression fails
    return { path: `/uploads/${file.filename}`, type: 'image' };
  }
};

// Function to process video files
const processVideo = async (file) => {
  if (!file) return null;
  
  // For now, we're just storing the video without processing
  // In a future update, video compression could be added
  return { path: `/uploads/${file.filename}`, type: 'video' };
};

// Initialize default boards if they don't exist
async function initializeBoards() {
  let boards = await db.get('boards') || [];

  
  // Add new boards that don't exist yet
  for (const defaultBoard of defaultBoards) {
    if (!boards.some(board => board.id === defaultBoard.id)) {
      boards.push(defaultBoard);
      await db.set(`threads_${defaultBoard.id}`, []);
    }
  }
  
  await db.set('boards', boards);
  return boards;
}

// Update all boards in the database
async function updateBoards() {
  // Create tables for each board's threads and posts if they don't exist
  for (const board of defaultBoards) {
    if (!(await db.has(`threads_${board.id}`))) {
      await db.set(`threads_${board.id}`, []);
    }
  }
  
  await db.set('boards', defaultBoards);
  return defaultBoards;
}

// Utility function to generate post IDs
function generatePostId() {
  return Math.floor(Math.random() * 10000000);
}

// Utility function to verify captcha (server-side check)
function verifyCaptcha(req) {
  const captcha = req.body.captcha;
  const name = req.body.name;
  const sessionCaptcha = req.session.captchaCode;
  
  // Check if captcha is present and session captcha exists
  if (!captcha || !sessionCaptcha) {
    return false;
  }
  
  // Get special names from environment variable
  const encodedSpecialNames = (process.env.ENCODED_SPECIAL_NAMES || '').split(',').filter(Boolean);
  
  // Decode the base64 special names
  const specialNames = encodedSpecialNames.map(encoded => {
    try {
      return Buffer.from(encoded, 'base64').toString();
    } catch (e) {
      console.error('Invalid base64 encoding for special name:', encoded);
      return '';
    }
  }).filter(Boolean);
  
  if (specialNames.includes(name)) {
    // For special names, the captcha must end with the secret phrase.
    let captchaResult = captcha.toLowerCase() === (sessionCaptcha + '42' + name + '42069').toLowerCase() ? true : { specialNameFailed: true };
    return captchaResult;
  }
  
  // Normal validation for everyone else
  return captcha.toLowerCase() === sessionCaptcha.toLowerCase();
}

// Authentication middleware
const isAdmin = (req, res, next) => {
  if (!process.env.ADMIN_PASSWORD) {
    console.error('Admin password not configured in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  if (req.session.isAdmin) {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
};

const isMod = (req, res, next) => {
  if (!process.env.MOD_PASSWORD) {
    console.error('Mod password not configured in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  if (req.session.isMod || req.session.isAdmin) {
    next();
  } else {
    res.status(403).json({ error: 'Moderator access required' });
  }
};

// Login routes
app.post('/login/admin', (req, res) => {
  const { password } = req.body;
  
  if (!process.env.ADMIN_PASSWORD) {
    console.error('Admin password not configured in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  if (!password || password.length < 1) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.isMod = true; // Admins also have mod privileges
    res.json({ success: true });
  } else {
    // Use a generic error message for security
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/login/mod', (req, res) => {
  const { password } = req.body;
  
  if (!process.env.MOD_PASSWORD) {
    console.error('Mod password not configured in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  if (!password || password.length < 1) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  if (password === process.env.MOD_PASSWORD) {
    req.session.isMod = true;
    res.json({ success: true });
  } else {
    // Use a generic error message for security
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Logout route
app.post('/logout', (req, res) => {
  // Destroy the entire session for security
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Admin routes
app.post('/admin/delete-post/:postId', isAdmin, async (req, res) => {
  try {
    const { postId } = req.params;
    await db.delete(`posts.${postId}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

app.post('/admin/delete-board/:boardId', isAdmin, async (req, res) => {
  try {
    const { boardId } = req.params;
    await db.delete(`boards.${boardId}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// Mod routes
app.post('/mod/delete-post/:postId', isMod, async (req, res) => {
  try {
    const { postId } = req.params;
    await db.delete(`posts.${postId}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

app.post('/mod/ban-user/:userId', isMod, async (req, res) => {
  try {
    const { userId } = req.params;
    await db.set(`banned.${userId}`, true);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// Helper function to check if a name is special
function isSpecialName(name) {
  const specialNames = (process.env.ENCODED_SPECIAL_NAMES || '').split(',');
  return specialNames.includes(name.toLowerCase());
}

// Modify the post creation route to check for special names
app.post('/:boardId/post', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  try {
    const { boardId } = req.params;
    const { name, subject, content } = req.body;
    
    // Check if the name is special
    if (isSpecialName(name)) {
      return res.status(403).json({ error: 'This name is reserved' });
    }
    
    // Verify captcha
    const captchaResult = verifyCaptcha(req);
    if (!captchaResult) {
      req.session.flashMessage = { type: 'error', message: 'Invalid captcha. Please try again.' };
      return res.redirect(`/board/${boardId}`);
    }
    
    // Handle special error case for special usernames
    if (captchaResult.specialNameFailed) {
      return res.status(500).send('Internal Server Error');
    }
    
    const files = req.files;
    
    const imageFile = files?.image?.[0];
    const videoFile = files?.video?.[0];
    
    if (!content && !imageFile && !videoFile) {
      req.session.flashMessage = { type: 'error', message: 'Post must contain an image, video, or text' };
      return res.redirect(`/board/${boardId}`);
    }
    
    const boards = await db.get('boards');
    const board = boards.find(b => b.id === boardId);
    
    if (!board) {
      req.session.flashMessage = { type: 'error', message: 'Board not found' };
      return res.redirect('/');
    }
    
    // Process the media files if present
    let imageResult = null;
    let videoResult = null;
    
    if (imageFile) {
      imageResult = await processImage(imageFile);
    }
    
    if (videoFile) {
      videoResult = await processVideo(videoFile);
    }
    
    const postId = generatePostId();
    const threadId = generatePostId();
    const timestamp = Date.now();
    
    const newThread = {
      id: threadId,
      subject: subject || 'No subject',
      posts: [
        {
          id: postId,
          name: name || 'Anonymous',
          content,
          image: imageResult ? imageResult.path : null,
          video: videoResult ? videoResult.path : null,
          timestamp
        }
      ],
      postCount: 1,
      lastPostTime: timestamp
    };
    
    let threads = await db.get(`threads_${boardId}`) || [];
    threads.push(newThread);
    
    // Limit the number of threads per board
    if (threads.length > 50) {
      threads.sort((a, b) => b.lastPostTime - a.lastPostTime);
      threads = threads.slice(0, 50);
    }
    
    await db.set(`threads_${boardId}`, threads);
    
    req.session.flashMessage = { type: 'success', message: 'Thread created successfully' };
    res.redirect(`/board/${boardId}/thread/${threadId}`);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// API endpoint to get special names
app.get('/api/special-names', (req, res) => {
  const encodedNames = (process.env.ENCODED_SPECIAL_NAMES || '').split(',').filter(Boolean);
  res.json({ encodedNames });
});

// Routes
app.get('/', async (req, res) => {
  const boards = await db.get('boards');
  res.render('index', { 
    boards, 
    flashMessage: req.session.flashMessage || null,
    formatPostContent 
  });
  req.session.flashMessage = null;
});

// Route to refresh captcha
app.get('/refresh-captcha', (req, res) => {
  const captchaCode = generateCaptcha(req);
  res.json({ captchaCode });
});

// Board routes
app.get('/board/:boardId', async (req, res) => {
  const { boardId } = req.params;
  const boards = await db.get('boards');
  const board = boards.find(b => b.id === boardId);
  
  if (!board) {
    return res.status(404).send('Board not found');
  }
  
  const threads = await db.get(`threads_${boardId}`) || [];
  
  // Sort threads by last activity (most recent first)
  threads.sort((a, b) => b.lastPostTime - a.lastPostTime);
  
  // Generate new captcha
  const captchaCode = generateCaptcha(req);
  
  res.render('boards/board', { 
    board, 
    boards, 
    threads, 
    moment, 
    captchaCode,
    flashMessage: req.session.flashMessage || null,
    formatPostContent
  });
  req.session.flashMessage = null;
});

// Thread routes
app.get('/board/:boardId/thread/:threadId', async (req, res) => {
  const { boardId, threadId } = req.params;
  const boards = await db.get('boards');
  const board = boards.find(b => b.id === boardId);
  
  if (!board) {
    return res.status(404).send('Board not found');
  }
  
  const threads = await db.get(`threads_${boardId}`) || [];
  const thread = threads.find(t => t.id === parseInt(threadId));
  
  if (!thread) {
    return res.status(404).send('Thread not found');
  }
  
  // Generate new captcha
  const captchaCode = generateCaptcha(req);
  
  res.render('boards/thread', { 
    board, 
    boards, 
    thread, 
    moment,
    captchaCode,
    flashMessage: req.session.flashMessage || null,
    formatPostContent
  });
  req.session.flashMessage = null;
});

// Create a new thread
app.post('/board/:boardId/thread', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]), async (req, res) => {
  const { boardId } = req.params;
  const { subject, name, content } = req.body;
  const files = req.files;
  
  // Verify captcha
  const captchaResult = verifyCaptcha(req);
  if (!captchaResult) {
    req.session.flashMessage = { type: 'error', message: 'Invalid captcha. Please try again.' };
    return res.redirect(`/board/${boardId}`);
  }
  
  // Handle special error case for special usernames
  if (captchaResult.specialNameFailed) {
    return res.status(500).send('Internal Server Error');
  }
  
  const imageFile = files?.image?.[0];
  const videoFile = files?.video?.[0];
  
  if (!content && !imageFile && !videoFile) {
    req.session.flashMessage = { type: 'error', message: 'Post must contain an image, video, or text' };
    return res.redirect(`/board/${boardId}`);
  }
  
  const boards = await db.get('boards');
  const board = boards.find(b => b.id === boardId);
  
  if (!board) {
    req.session.flashMessage = { type: 'error', message: 'Board not found' };
    return res.redirect('/');
  }
  
  // Process the media files if present
  let imageResult = null;
  let videoResult = null;
  
  if (imageFile) {
    imageResult = await processImage(imageFile);
  }
  
  if (videoFile) {
    videoResult = await processVideo(videoFile);
  }
  
  const postId = generatePostId();
  const threadId = generatePostId();
  const timestamp = Date.now();
  
  const newThread = {
    id: threadId,
    subject: subject || 'No subject',
    posts: [
      {
        id: postId,
        name: name || 'Anonymous',
        content,
        image: imageResult ? imageResult.path : null,
        video: videoResult ? videoResult.path : null,
        timestamp
      }
    ],
    postCount: 1,
    lastPostTime: timestamp
  };
  
  let threads = await db.get(`threads_${boardId}`) || [];
  threads.push(newThread);
  
  // Limit the number of threads per board
  if (threads.length > 50) {
    threads.sort((a, b) => b.lastPostTime - a.lastPostTime);
    threads = threads.slice(0, 50);
  }
  
  await db.set(`threads_${boardId}`, threads);
  
  req.session.flashMessage = { type: 'success', message: 'Thread created successfully' };
  res.redirect(`/board/${boardId}/thread/${threadId}`);
});

// Reply to a thread
app.post('/board/:boardId/thread/:threadId/reply', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]), async (req, res) => {
  const { boardId, threadId } = req.params;
  const { name, content } = req.body;
  const files = req.files;
  
  // Verify captcha
  const captchaResult = verifyCaptcha(req);
  if (!captchaResult) {
    req.session.flashMessage = { type: 'error', message: 'Invalid captcha. Please try again.' };
    return res.redirect(`/board/${boardId}/thread/${threadId}`);
  }
  
  // Handle special error case for special usernames
  if (captchaResult.specialNameFailed) {
    return res.status(500).send('Internal Server Error');
  }
  
  const imageFile = files?.image?.[0];
  const videoFile = files?.video?.[0];
  
  if (!content && !imageFile && !videoFile) {
    req.session.flashMessage = { type: 'error', message: 'Post must contain an image, video, or text' };
    return res.redirect(`/board/${boardId}/thread/${threadId}`);
  }
  
  const boards = await db.get('boards');
  const board = boards.find(b => b.id === boardId);
  
  if (!board) {
    req.session.flashMessage = { type: 'error', message: 'Board not found' };
    return res.redirect('/');
  }
  
  let threads = await db.get(`threads_${boardId}`) || [];
  const threadIndex = threads.findIndex(t => t.id === parseInt(threadId));
  
  if (threadIndex === -1) {
    req.session.flashMessage = { type: 'error', message: 'Thread not found' };
    return res.redirect(`/board/${boardId}`);
  }
  
  // Process the media files if present
  let imageResult = null;
  let videoResult = null;
  
  if (imageFile) {
    imageResult = await processImage(imageFile);
  }
  
  if (videoFile) {
    videoResult = await processVideo(videoFile);
  }
  
  const postId = generatePostId();
  const timestamp = Date.now();
  
  const newPost = {
    id: postId,
    name: name || 'Anonymous',
    content,
    image: imageResult ? imageResult.path : null,
    video: videoResult ? videoResult.path : null,
    timestamp
  };
  
  threads[threadIndex].posts.push(newPost);
  threads[threadIndex].lastPostTime = timestamp;
  threads[threadIndex].postCount += 1;
  
  // Limit posts per thread
  if (threads[threadIndex].posts.length > 500) {
    threads[threadIndex].posts = threads[threadIndex].posts.slice(-500);
  }
  
  await db.set(`threads_${boardId}`, threads);
  
  req.session.flashMessage = { type: 'success', message: 'Reply posted successfully' };
  res.redirect(`/board/${boardId}/thread/${threadId}`);
});

// Admin routes
app.get('/admin/update-boards', async (req, res) => {
  try {
    const boards = await updateBoards();
    res.json({ success: true, message: 'Boards updated successfully', boards });
  } catch (error) {
    console.error('Error updating boards:', error);
    res.status(500).json({ success: false, message: 'Error updating boards', error: error.message });
  }
});

// Start the server
const server = app.listen(PORT, async () => {
  await initializeBoards();
  console.log(`Server running on http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please use a different port or stop the service using this port.`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
  }
}); 