//External libraries
var http = require('http');
var url = require('url');
var path = require('path');
var fs = require('fs');
var querystring = require('querystring');
var sqlite3 = require('sqlite3');

//Revealing Module Design Pattern 
//Immediately-Invoked-Function-Expression, it declares a function, which then calls itself immediately 
var apiV1 = (function () {
	var	mimeTypes = {'html': 'text/html', 'png': 'image/png', "jpeg": "image/jpeg", "jpg": "image/jpeg", 'js': 'text/javascript', 'css': 'text/css'};
	var msgMissingParms = '{"error": "missing parameters: ';
	var msgBadRequest = '{"error": "bad request"}';

	//database, establish filename association 
	var	db = new sqlite3.Database('teamnode.db');
	
	var serveFromDisk = function(filename, response) {
		var pathname;
		var stats, extension, mimeType, fileStream;	

		try {
			pathname = path.join(process.cwd(), unescape(filename));		
			extension = path.extname(pathname).substr(1);
		
			if(extension == null || extension == '') {
				extension = 'html';
				pathname += '.html';
			}

			mimeType = mimeTypes[extension] || 'application/octet-stream';
			stats = fs.lstatSync(pathname); // throws error if path doesn't exist
		} catch (e) {
			try {
				//remove .html, might be a directory
				pathname = pathname.slice(0,-5)
				stats = fs.lstatSync(pathname); // throws error if path doesn't exist	
			} catch (e) {
				response.writeHead(404, {'Content-Type': 'text/plain'});
				response.write('404 Not Found\n');
				response.end();
				return;
			}
		}

		if (stats.isFile()) {
			//path exists, is a file
		} else if (stats.isDirectory()) {
			//path exists, is a directory
			filename = filename + '/index.html';
			pathname = pathname  + '\\index.html';
		} else {
			// Symbolic link, other?
			response.writeHead(500, {'Content-Type': 'text/plain'});
			response.write('500 Internal server error\n');
			response.end();
		}	 


		console.log('serving ' + filename + ' as ' + mimeType);
		
		//cache for 10 minutes local, shared cache 1 hour  -- or use without cache for dev debugging	
		response.writeHead(200, {'Content-Type': mimeType,"Cache-Control": "public, max-age=600, s-maxage=3600"});			
		//response.writeHead(200, {'Content-Type': mimeType});
		
		fileStream = fs.createReadStream(pathname);
		fileStream.pipe(response);
	}; 
	
	var fetchLastInsertId = function(callback) {
		var	dbStatement = db.prepare('SELECT last_insert_rowid() as id');
		
		dbStatement.each(function (err, row) {
			if(err) {
				callback(err);
			} else {
				callback(null,row);
			}
		});	
	};

	var fetchInfo = function(data, callback) {
		console.log('api v1: fetchInfo');
		var	dbStatement = db.prepare('SELECT id, category, key, value FROM info');
		var jsonData = {};			
	
		dbStatement.each(function (err, row) {
			if(err) {
				callback(err);
			} else {
				var key = row.category + row.key;
				jsonData[key] = row.value;
			}	
		}, function () {
			callback(null,jsonData);
		});	

	};	

	var fetchTeams = function(data, callback) {
		console.log('api v1: fetchTeams');
		var	dbStatement = db.prepare('SELECT id, shorthand, name, background, fontcolor FROM teams');
		var	dbSelectTeam = db.prepare('SELECT id, shorthand, name, background, fontcolor FROM teams WHERE id = (?)');
		var jsonData = { teams: [] };			
	
		if(data.teamid) {
			dbSelectTeam.each([data.teamid], function (err, row) {
				if(err) {
					callback(err);
				} else {
					jsonData.teams.push({ id: row.id, shorthand: row.shorthand, name: row.name, background: row.background, fontcolor: row.fontcolor });
				}	
			}, function () {
				callback(null,jsonData);
			});			
			
		} else {
			dbStatement.each(function (err, row) {
				if(err) {
					callback(err);
				} else {
					jsonData.teams.push({ id: row.id, shorthand: row.shorthand, name: row.name, background: row.background, fontcolor: row.fontcolor });
				}	
			}, function () {
				callback(null,jsonData);
			});
		}		
	};
	
	var fetchPages = function(data, callback) {
		console.log('api v1: fetchPages: data = ' + JSON.stringify(data));
		var	dbStatement = db.prepare('SELECT id, name, url FROM pages WHERE teamid = (?)');	
		var jsonData = { pages: [] };			
	
		if(data.teamid) {	
			dbStatement.each([data.teamid],function (err, row) {
				if(err) {
					callback(err);
				} else {
					jsonData.pages.push({ id: row.id, name: row.name, url: row.url });
				}
			}, function () {
				callback(null,jsonData);
			});
		} else {
			callback(new Error('Missing teamid'));
		}
	};	

	var fetchSchedule = function(data, callback) {
		console.log('api v1: fetchSchedule');
		var	dbStatement = db.prepare('SELECT id, date, time, opponent, location, score, result FROM schedules WHERE teamid = (?)');
		var jsonData = { results: [] };			
	
		if(data) {	
			dbStatement.each([data.teamid],function (err, row) {
				if(err) {
					callback(err);
				} else {
					jsonData.results.push({ id: row.id, date: row.date, time: row.time, opponent: row.opponent, location: row.location, score: row.score, result: row.result});
				}
			}, function () {
				callback(null,jsonData);
			});
		} else {
			callback(new Error('Missing teamid'));
		}
	};	

	var fetchRoster = function(data, callback) {
		console.log('api v1: fetchRoster');
		var	dbStatement = db.prepare('SELECT id, firstname, lastname, position, grade, jersey FROM rosters WHERE teamid = (?)');	
		var jsonData = { results: [] };			
	
		if(data) {	
			dbStatement.each([data.teamid],function (err, row) {
				if(err) {
					callback(err);
				} else {
					jsonData.results.push({ id: row.id, firstname: row.firstname, lastname: row.lastname, position: row.position, grade: row.grade, jersey: row.jersey});
				}
			}, function () {
				callback(null,jsonData);
			});
		} else {
			callback(new Error('Missing teamid'));
		}
	};	

	var fetchCoaches = function(data, callback) {
		console.log('api v1: fetchCoaches: data = ' + JSON.stringify(data));
		var dbStatement = db.prepare('Select coaches.id, firstname, lastname, phone, email FROM coaches JOIN teamscoaches ON coaches.id = teamscoaches.coachid WHERE teamscoaches.teamid = (?)');
		var jsonData = { pages: [] };			
	
		if(data.teamid) {	
			dbStatement.each([data.teamid],function (err, row) {
				if(err) {
					callback(err);
				} else {
					jsonData.pages.push({ id: row.id, firstname: row.firstname, lastname: row.lastname, phone: row.phone, email: row.email  });
				}
			}, function () {
				callback(null,jsonData);
			});
		} else {
			callback(new Error('Missing teamid'));
		}
	};	
	
	var fetchNews = function(data, callback) {
		console.log('api v1: fetchNews: data = ' + JSON.stringify(data));
		var dbStatement = db.prepare('Select news.id, title, details, alert FROM news JOIN teamsnews ON news.id = teamsnews.newsid WHERE teamsnews.teamid = (?)');
		var jsonData = { pages: [] };			
	
		if(data.teamid) {	
			dbStatement.each([data.teamid],function (err, row) {
				if(err) {
					callback(err);
				} else {
					jsonData.pages.push({ id: row.id, title: row.title, details: row.details, alert: row.alert });
				}
			}, function () {
				callback(null,jsonData);
			});
		} else {
			callback(new Error('Missing teamid'));
		}
	};

	var fetchGalleries = function(data, callback) {
		console.log('api v1: fetchGalleries: data = ' + JSON.stringify(data));
		var dbStatement = db.prepare('Select distinct gallery FROM photos JOIN teamsphotos ON photos.id = teamsphotos.photoid WHERE teamsphotos.teamid = (?)');
		var jsonData = { galleries: [] };			
	
		if(data.teamid) {	
			dbStatement.each([data.teamid],function (err, row) {
				if(err) {
					callback(err);
				} else {
					jsonData.galleries.push({ gallery: row.gallery});
				}
			}, function () {
				callback(null,jsonData);
			});
		} else {
			callback(new Error('Missing teamid'));
		}
	};	
	
	var fetchPhotos = function(data, callback) {
		console.log('api v1: fetchPhotos: data = ' + JSON.stringify(data));
		var dbStatement = db.prepare('Select photos.id, title, description, gallery, filename FROM photos JOIN teamsphotos ON photos.id = teamsphotos.photoid WHERE teamsphotos.teamid = (?) and teamsphotos.gallery = (?)');
		var jsonData = { photos: [] };			
	
		if(data.teamid) {	
			dbStatement.each([data.teamid, data.gallery],function (err, row) {
				if(err) {
					callback(err);
				} else {
					jsonData.photos.push({id: row.id, title: row.title, description: row.description, gallery: row.gallery, filename: row.filename});
				}
			}, function () {
				callback(null,jsonData);
			});
		} else {
			callback(new Error('Missing teamid'));
		}
	};		
 
	//Expose methods as public
	return {
		serveFromDisk: serveFromDisk,
		fetchInfo: fetchInfo,
		fetchTeams: fetchTeams,
		fetchPages: fetchPages,
		fetchSchedule: fetchSchedule,		
		fetchRoster: fetchRoster,
		fetchCoaches: fetchCoaches,
		fetchNews: fetchNews,
		fetchGalleries: fetchGalleries,
		fetchPhotos: fetchPhotos
	};
	
})();

//Export functions that are exposed for use by other modules
exports.serveFromDisk = apiV1.serveFromDisk;
exports.fetchInfo = apiV1.fetchInfo;
exports.fetchTeams = apiV1.fetchTeams;
exports.fetchPages = apiV1.fetchPages;
exports.fetchSchedule = apiV1.fetchSchedule;
exports.fetchRoster = apiV1.fetchRoster;
exports.fetchCoaches = apiV1.fetchCoaches;
exports.fetchNews = apiV1.fetchNews;
exports.fetchGalleries = apiV1.fetchGalleries;
exports.fetchPhotos = apiV1.fetchPhotos;




