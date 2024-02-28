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

			res.send(song.name)

		}

	} catch (error) {
		res.send("Error")
		console.error(error);
		res.status(500).send("Error adding song");
	}
});


app.post('/remove-song', async (req, res) => {
	try {
		const { songName } = req.body;

		const playlistPath = path.join(__dirname, 'data', 'playlist.json');

		if (fs.existsSync(playlistPath)) {
			const playlist = JSON.parse(fs.readFileSync(playlistPath, 'utf-8'));

			const indexToRemove = playlist.findIndex(song => song.name === songName);

			if (indexToRemove !== -1) {
				const removedSong = playlist.splice(indexToRemove, 1)[0];

				fs.writeFileSync(playlistPath, JSON.stringify(playlist, null, 2));

				res.send('Song removed');
			} else {
				res.status(404).send('Song not found in the playlist');
			}
		} else {
			res.status(404).send('Playlist not found');
		}
	} catch (error) {
		console.error(error);
		res.status(500).send('Error removing song');
	}
});


app.post('/clear-playlist', async (req, res) => {
	try {
		const playlistPath = path.join(__dirname, 'data', 'playlist.json');
		fs.writeFileSync(playlistPath, JSON.stringify([], null, 2));
		res.status(204).send();

	} catch (error) {
		console.error(error);
		res.status(500).send('Error clearing playlist');
	}
});


app.post('/delete-songs', async (req, res) => {
	try {
		const playlistPath = path.join(__dirname, 'data', 'playlist.json');

		fs.writeFileSync(playlistPath, JSON.stringify([], null, 2));

		const songsDir = path.join(__dirname, 'data', 'songs');
		fs.readdirSync(songsDir).forEach(file => {
			if (file.endsWith('.mp3')) {
				fs.unlinkSync(path.join(songsDir, file));
			}
		});

		res.status(204).send();

	} catch (error) {
		console.error(error);
		res.status(500).send('Error clearing playlist and deleting mp3 files');
	}
});


app.post('/get-stats', async (req, res) => {
    try {
        const songsDir = path.join(__dirname, 'data', 'songs');

        const mp3Files = fs.readdirSync(songsDir).filter(file => file.endsWith('.mp3'));

        const totalSizeGB = mp3Files.reduce((acc, file) => {
            const filePath = path.join(songsDir, file);
            const stats = fs.statSync(filePath);
            return acc + stats.size;
        }, 0) / (1024 * 1024 * 1024);

        const mp3Count = mp3Files.length;

        res.status(200).json({ songCount: mp3Count, totalSizeGB: totalSizeGB.toFixed(3) });

    } catch (error) {
        console.error(error);
        res.status(500).send('Error getting song count and size');
    }
});


app.get("/get-playlist", (req, res) => {
	const playlistPath = path.join(__dirname, 'data', 'playlist.json');
	const playlist = JSON.parse(fs.readFileSync(playlistPath));
	res.json(playlist);
});

