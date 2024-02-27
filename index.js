const express = require("express");
const app = express();
var bodyParser = require("body-parser");
const http = require("http");
var fs = require("fs");
const axios = require("axios");
const path = require("path");
const compression = require("compression");
const ytdl = require("ytdl-core");
const ytsr = require('@distube/ytsr');
require("dotenv").config();


app.set("view engine", "ejs");
app.use(express.json({ limit: "100mb" }));
app.use(bodyParser.json({ limit: "100mb" }));
app.use(
	bodyParser.urlencoded({
		limit: "100mb",
		extended: true,
		parameterLimit: 50000,
	})
);

app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.static("public"));
app.use('/songs', express.static(path.join(__dirname, 'data', 'songs')));

function shouldCompress(req, res) {
	if (req.headers["x-no-compression"]) {
		return false;
	}
	const contentType = res.getHeader("Content-Type");
	return !contentType || !contentType.startsWith("image/");
}

app.use(compression({ filter: shouldCompress }));

const httpServer = http.createServer(app);
const ipAddress = "localhost";
const port = 6969;

httpServer.listen(port, ipAddress, () => {
	console.log(`HTTP server listening on ${ipAddress}:${port}`);
});





const WebSocket = require("ws");
const wss = new WebSocket.Server({ server: httpServer });

wss.on("connection", (ws) => {
	sendPlaylistToClient(ws);
  
	fs.watch(path.join(__dirname, "data", "playlist.json"), (eventType) => {
	  if (eventType === "change") {
		console.log("Playlist updated. Sending new playlist to clients.");
		sendPlaylistToClient(ws);
	  }
	});
  });
  
  function sendPlaylistToClient(client) {
	const playlistPath = path.join(__dirname, "data", "playlist.json");
	const playlist = JSON.parse(fs.readFileSync(playlistPath));
	const playlistMessage = JSON.stringify({ type: "playlist", data: playlist });
  
	client.send(playlistMessage);
  }





app.get("/", (req, res) => {
	let playlist = JSON.parse(fs.readFileSync('./data/playlist.json'));
	res.render("index", {
		playlist
	});
});


app.post("/add-song", async (req, res) => {
	try {
		const { songName } = req.body;

		const searchResults = await ytsr(songName, { safeSearch: true, limit: 1 });

		if (searchResults && searchResults.items.length > 0) {
			const song = searchResults.items[0];
			console.log('Name: ' + song.name);
			console.log('URL: ' + song.url);
			console.log('Duration: ' + song.duration);

			const sanitizedSongName = song.name.replace(/[\/?<>\\:*|""]/g, '');
			const fileName = sanitizedSongName.replace(/\s+/g, '_') + ".mp3";
			const filePath = path.join(__dirname, 'data', 'songs', fileName);

			if (!fs.existsSync(filePath)) {
				console.log("Downloading " + song.name);
				ytdl(song.url, { filter: 'audioonly' }).pipe(fs.createWriteStream(filePath));
			}

			const playlistPath = path.join(__dirname, 'data', 'playlist.json');
			const playlist = JSON.parse(fs.readFileSync(playlistPath, 'utf-8'));

			const newSong = {
				originalName: song.name,
				name: sanitizedSongName,
				duration: song.duration,
				path: filePath
			};

			playlist.push(newSong);
			fs.writeFileSync(playlistPath, JSON.stringify(playlist, null, 2));

			console.log('Playlist updated with ' + song.name);

		}

	} catch (error) {
		console.error(error);
		res.status(500).send("Error adding song");
	}
});


app.get("/get-playlist", (req, res) => {
	const playlistPath = path.join(__dirname, 'data', 'playlist.json');
	const playlist = JSON.parse(fs.readFileSync(playlistPath));
	res.json(playlist);
});

