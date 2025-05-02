# sChan

sChan is a simple imageboard similar to 4chan, built with Node.js, Express.js, and quick.db with SQLite backend.

## Features

- Multiple boards for different topics
- Thread creation with text and images
- Thread replies with text and images
- 4chan-like UI and experience
- Lightweight and easy to set up

## Technologies

- Node.js
- Express.js
- quick.db (SQLite)
- EJS for templating
- Multer for file uploads

## Installation

1. Clone the repository:

```
git clone https://github.com/yourusername/schan.git
cd schan
```

2. Install dependencies:

```
npm install
```

3. Start the server:

```
npm start
```

For development with automatic reloading:

```
npm run dev
```

4. Visit `http://localhost:3000` in your browser

## Structure

- `/public` - Static assets (CSS, JavaScript, uploaded images)
- `/views` - EJS templates
- `/index.js` - Main application file

## Some Default Boards

- /b/ - Random
- /a/ - Anime & Manga
- /g/ - Technology
- /p/ - Photography
- More...

## License

MIT 