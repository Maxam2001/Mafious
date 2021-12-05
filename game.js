var state = 0; //-1: starting, 0: not yet started, 1: night, 2: day, 3: finished

var dayStart = false; //true = เรื่มด้วยกลางวัน, false = เริ่มด้วยกลางคืน

var dayDuration = 60;	//ระยะเวลากลางวัน(วินาที)
var nightDuration = 30;	//ระยะเวลากลางคืน(วินาที)

var dayCount = 0;	//กลางวัน เริ่มครั้งที่ 0
var nightCount = 0;	//กลางคืน เริ่มครั้งที่ 0

var wills = false;	// ?

// ?
function clone(obj) {
	if(obj == null || typeof(obj) != 'object')
		return obj;

	var temp = obj.constructor(); // changed

	for(var key in obj)
		temp[key] = clone(obj[key]);
	return temp;
}

// หาฝั่งชนะ
function checkVictory () {
	var villageVictory = (io.sockets.clients('mafia').length === 0); // villager ชนะ ถ้า mafia เหลือ 0
	var mafiaVictory = (io.sockets.clients('mafia') >= io.sockets.clients('village')); //mafia ชนะ ถ้า villager เหลือ >= mafia

	if (villageVictory) {
		endGame('Village'); //ถ้า villager ชนะ เข้า function 'endgame' ด้วยค่า villager
	} else if (mafiaVictory) {
		endGame('Mafia');	//ถ้า mafia ชนะ เข้า function 'endgame' ด้วยค่า mafia
	}
}

//จัดความสามารถสำหรับคนตาย ?
function playerDeathCleanup (socket) {
	socket.game_alive = false;
	socket.leave('alive');

	socket.emit('disableField', false);
	socket.emit('displayVote', true);
	socket.emit('disableVote', true);	//ห้ามโหวต ?

	socket.game_role = null;
	socket.leave('village');
	socket.leave('mafia');
	socket.join('spectator');
}

//ฆ่าคน
function killPlayer (socket) {
	playerDeathCleanup(socket);	//จัดความสามารถสำหรับคนตาย ?
	io.sockets.emit('playerDied', socket.game_nickname);	//ให้สถานะตาย

	if (wills) {
		if (socket.game_will !== '') {
			io.sockets.emit('message', { message: socket.game_nickname + '\'s will: ' + socket.game_will});
		} else {
			io.sockets.emit('message', { message: socket.game_nickname + ' did not leave a will.'});
		}
	}

	checkVictory();	//เช็คหากฆ่าแล้วสามารถชนะได้หรือไม่
}

//role definitions, to be moved to a JSON file at some point in the near future
var roles = {
	villager: {
		name: 'villager', //the role's reported name 
		group: 'village', //group players assigned the role are affiliated with
		power: false //does the role have any special actions at nighttime
	},
	mafioso: {
		name: 'mafioso',
		group: 'mafia',
		power: false
	}
};
//end role definitions

//หากไม่ใช้ custom ?
var playerRoles = [
	roles['villager'],
	roles['villager'],
	roles['villager'],
	roles['villager'],
 	/* roles['villager'],
	roles['villager'],
	roles['mafioso'], */
	roles['mafioso']
];

//function สุ่ม role จาก default หรือ custom ให้กับ players
function shuffle (players) {
	var m = players.length, t, i;

	while (m) {
		i = Math.floor(Math.random() * m--);

		t = players[m];
		players[m] = players[i];
		players[i] = t;
	}

	return players;
}

// ตัวแปร ประกาศ (narrator?)
var announcement = '';

function updateAnnouncement (string) {
	announcement = string;
	io.sockets.emit('announcement', { message: announcement });
}

// ตัวแปรประกาศตอนจบเกม?
var header = '';

// ใช้ประกาศตอนจบเกม?
function updateHeader (string) {
	header = string;
	io.sockets.emit('header', { message: header });
}

// จัด role (ใช้กับฟังก์ชัน initialize ด้านล่าง)
function assignRoles () {
	var players = [];	//var ของผู้เล่น ตามจำนวนที่เข้ามา
	io.sockets.clients().forEach(function (socket) {
		players.push(socket);
	});
	players = shuffle(players);

	// ประกาศขึ้นจอของแต่ละคนว่าได้อะไร พร้อมเซ็ตสถานะ
	for (var i = 0; i < players.length; i++) {
		if (i <= playerRoles.length - 1) {	//คนที่ได้เล่น
			players[i].game_alive = true;
			players[i].join('alive');
			players[i].game_role = playerRoles[i];
			players[i].join(playerRoles[i].group);
			players[i].emit('message', { message: 'You have been assigned the role of ' + playerRoles[i].name + '. You are affiliated with the ' + playerRoles[i].group + '.' });
		} else {	//คนที่ไม่ได้เล่น, เข้ามาระหว่างเกม?
			players[i].game_alive = false;
			players[i].join('spectator');
			players[i].emit('message', { message: 'Since the roles are full, you have been assigned the role of spectator.' });
		}
	}
}

// จบเกม หากคนตายเข้าเงื่อนไข
function endGame (winner) {
	state = 3;
	updateHeader('Game over');
	updateAnnouncement(winner + ' wins the game!');
	io.sockets.clients('alive').forEach(function (socket) {
		playerDeathCleanup(socket);	//ทำให้ทุกคนตาย เพื่อจะได้คุยกันได้หมดกับคนที่ตายก่อน
	});
}

// ฟังก์ชันสำหรับนับโหวต ให้ขึ้นว่าใครโหวตใคร 
function countedVotes (arr) {
	var a = [], b = [], prev;

	arr.sort();
  
	for (var i = 0; i < arr.length; i++) {
		if (arr[i] !== prev) {
			a.push(arr[i]);
			b.push(1);
		} else {
			b[b.length-1]++;
		}
		prev = arr[i];
	}

	var results = [];

	for (var i = 0; i < a.length; i++) {
		results.push({'username': a[i], 'votes': b[i]});
	}

	results.sort(function (a, b) {
		return (b.votes - a.votes);
	});

	return results; //todo: randomize results if 2 players tie (currently sorts alphabetically)
}

// ฟังก์ชันจริงที่ใช้คำนวณโหวต ทั้งตอนฆ่าและโหวตออก
function handleVotes () {
	var votes = [];

	//เช็คก่อนว่าตอนนี้ กลางคืน(mafia โหวตฆ่า) หรือกลางวัน(คนที่รอดโหวตsuspect)
	if (state === 1) {
		votingGroup = 'mafia';
	} else {
		votingGroup = 'alive';
	}

	io.sockets.clients(votingGroup).forEach(function (socket) {
		if (!socket.game_vote) {
			votes.push('');
		} else {
			votes.push(socket.game_vote);
		}
	});

	var results = countedVotes(votes);
	if (results[0] && results[0].votes >= ((Math.floor(io.sockets.clients(votingGroup).length / 2)) + 1)) {
		io.sockets.clients().forEach(function (socket) {
			if (socket.game_nickname === results[0].username) { //ใช่คนที่โดนโหวตมากสุด
				socket.game_dying = true;	//ตาย
			} else {	//ที่เหลือ
				socket.game_dying = false;	//รอด
			}
		});
	}
}

// ?
function handlePowerVotes () {
	io.sockets.clients('alive').forEach(function (socket) {
		if (socket.game_powerVote && socket.game_role.power && socket.game_nickname != socket.game_powerVote) {
			io.sockets.clients().forEach(function (socket2) {
				if (socket.game_powerVote == socket2.game_nickname) {
					socket.game_role.powerFunc(socket, socket2);
					socket.game_powerVote = null;
				}
			});
		}
	});
}

// var สำหรับจบตอนกลางวัน
var endDay = false;

// ฟังก์ชันสำหรับวนกลางวัน
function dayLoop(duration, ticks) {
	var ticksLeft = duration - ticks;	//ใช้บอกว่าเหลือกี่วิ
	if (state !== 3) {	//ถ้ายังไม่จบเกม
		if (ticksLeft && !endDay) {	//ยังเหลือเวลา และยังไม่จบกลางวัน
			updateAnnouncement('Day ends in ' + ticksLeft + ' second(s)');	//แสดงวิที่เหลือ
			setTimeout(dayLoop, 1000, duration, ticks + 1);	//ทุก 1000ms วิ+1 เพื่อลดวิที่เหลือ
		} else {	//หมดเวลา หรือจบกลางวันแล้ว
			if (dayCount > 0 || nightCount > 0) {	//เป็นวันที่ 1 ขึ้นไป หรือคืนที่ 1 ขึ้นไป
				handleVotes();	//โหวตได้
				io.sockets.clients('alive').forEach(function (socket) {	//แจกปุ่มโหวตให้คนที่รอด?
					if (socket.game_dying) {
						//ถ้ามีคนโดนโหวตออก หลังโหวตจบให้ประกาศคนตาย พร้อมตำแหน่ง
						io.sockets.emit('message', { message: socket.game_nickname + ', the ' + socket.game_role.name + ', was lynched by the town!'});
						killPlayer(socket);	//ฆ่า
					}
				});
			}

			if (state !== 3) {	//และถ้าเกมยังไม่จบ
				nightCount++;	//เพิ่ม คืนที่ +1 (เปลี่ยนเป็นกลางคืน)
				updateHeader('<font class="fas fa-moon" color="yellow"></font></font>' + '<font color="black"> Night ' + nightCount + '</font>');	//ข้อความด้านบนก็เปลี่ยนเป็นกลางคืน
				updateAnnouncement('It is now nighttime');	//แจ้งทุกคนว่ากลางคืนแล้ว

				io.sockets.emit('clearTargets');	// ?
				
				var validMafiaTargets = [];	//ขึ้นโหวตสำหรับ mafia ว่าต้องเป็น villager ที่จะโหวตฆ่าได้
				io.sockets.clients('village').forEach(function (socket) {
					socket.emit('disableField', true);
					socket.emit('displayVote', false);
					validMafiaTargets.push(socket.game_nickname);
				});

				io.sockets.in('mafia').emit('validTargets', validMafiaTargets);

				var powerRoles = io.sockets.clients('alive').filter(function (socket) {
					return socket.game_role.power;
				});

				powerRoles.forEach(function (socket) {
					var validPowerTargets = [];

					io.sockets.clients('alive').forEach(function (socket2) {
						if (socket.game_nickname != socket2.game_nickname) {
							validPowerTargets.push(socket2.game_nickname);
						}
					});

					socket.emit('displayVote', true);
					socket.emit('validTargets', validPowerTargets);
				});

				var votingPlayers = [];
				io.sockets.clients('mafia').forEach(function (socket) {	//แจกปุ่มโหวตให้ mafia ที่รอด
					votingPlayers.push(socket.game_nickname);

					socket.game_hasVoted = false;
					socket.game_hasPowerVoted = false;
					socket.game_vote = null;
				});

				io.sockets.in('mafia').emit('votingPlayers', votingPlayers);

				setTimeout(nightLoop, 1000, nightDuration, 0);	//โยนไปกลางคืน
				state = 1;
				endDay = false;
			}
		}
	}
}

// ฟังก์ชันวนกลางคืน
function nightLoop(duration, ticks) {
	var ticksLeft = duration - ticks;
	if (state !== 3) {	//ถ้าเกมยังไม่จบ
		if (ticksLeft && !endDay) {	//ถ้าเวลาเหลือ หรือกลางคืนยังไม่จบ
			updateAnnouncement('Night ends in ' + ticksLeft + ' second(s)');	//แสดงเวลา
			setTimeout(nightLoop, 1000, duration, ticks + 1);	//ลดเวลาทุกวิ
		} else {	//ถ้าเวลาหมด หรือกลางคืนจบแล้ว
			if (dayCount > 0 || nightCount > 0) {
				handleVotes();	//แจกโหวต
				handlePowerVotes();	//โหวตใช้ไอเทม? ถ้าใช่ให้เอาออก
				io.sockets.clients('alive').forEach(function (socket) {
					if (socket.game_dying) {	//มีคนตายหรือไม่
						if (socket.game_immunity) {	//น่าจะสำหรับคนที่โดนฆ่า แต่มีหมอ เพราะงั้นเตรียมเอาออก
							socket.emit('message', { message: 'You wake up covered in bloodied bandages with a horrible headache, remembering nothing of the previous night.'});
								socket.game_dying = false;
						} else {	//ถ้ามีก็ประกาศว่ามีคนตายตอนกลางคืน
							io.sockets.emit('message', { message: socket.game_nickname + ', the ' + socket.game_role.name + ', was killed in the night!'});
							killPlayer(socket);
						}
					}

					//สถานะ immunity มาจากหมอ เราไม่ใช้ รอเอาออก
					socket.game_immunity = false; //immunity only lasts the night it is given
				});
			}

			//ถ้าตายแล้วยังไม่จบเกม
			if (state !== 3) { //surely there's a cleaner way to do this
				dayCount++;	//เพิ่มจำนวนวัน
				updateHeader('<font class="fas fa-sun" color="orange"></font></font>' + '<font color="white"> Day ' + dayCount + '</font>');	//ประกาศกลางวันที่
				updateAnnouncement('It is now daytime');	//ประกาศว่ากลางวันแล้ว

				io.sockets.in('alive').emit('disableField', false);
				io.sockets.in('alive').emit('displayVote', true);

				io.sockets.in('alive').emit('clearTargets');

				var votingPlayers = [];
				io.sockets.clients('alive').forEach(function (socket) {	//คนที่รอดให้โหวต

					votingPlayers.push(socket.game_nickname);

					socket.game_hasVoted = false;
					socket.game_hasPowerVoted = false;
					socket.game_vote = null;
				});

				io.sockets.in('alive').emit('validTargets', votingPlayers);
				io.sockets.emit('votingPlayers', votingPlayers);

				setTimeout(dayLoop, 1000, dayDuration, 0);	//โยนไปกลางวัน
				state = 2;
				endDay = false;
			}
		}
	}
}

//เปิดฉาก ทำงานตอนเริ่มเกมเมื่อคนครบ ?
function initialize () {
	assignRoles();	//แจก role
	var livingPlayers = [];	//ตัวแปรคนที่ยังมีชีวิต
	io.sockets.clients('alive').forEach(function (socket) {	//ยัดทุกคนที่แจกโรลลงไป
		livingPlayers.push(socket.game_nickname);
	});

	//possibly replace this later with a point for injecting this kind of thing, I would like everything to be modular
	if (wills) {
		io.sockets.emit('message', { message: 'This game session has wills enabled. Type /will to set yours.' });
		io.sockets.clients('alive').forEach(function (socket) {
			socket.game_will = '';
		});
	}

	io.sockets.in('alive').emit('playerList', livingPlayers);
	if (dayStart) {
		nightLoop(0, 0);
	} else {
		io.sockets.in('mafia').emit('displayVote', true);
		dayLoop(0, 0);
	}
}

// ตัวแปรนับถอยหลัง
var startingCountdownTimer = null;

// ฟังก์ชันสำหรับนำถอยหลังเรื่มเกมเมื่อคนครบ
function startingCountdown (duration, ticks) {
	var validClients = io.sockets.clients();
	validClients = validClients.filter(function (socket) {
		return (socket.game_nickname);
	});
	var numClients = validClients.length;	//จำนวนทุกคนในห้อง
	var reqPlayers = playerRoles.length;	//จำนวนคนที่ต้องการ นับตาม playerRoles หรือ playerRoles_default ที่เซ็ตไว้

	//ถ้าคนครบแล้ว หรือเกินก็ตาม
	if (numClients >= reqPlayers) { //need to move this redundant code to its own function
		var ticksLeft = duration - ticks;
		if (ticksLeft) {	//ถ้ายังเหลือเวลา
			updateAnnouncement('Game starting in ' + ticksLeft + ' second(s)');	//นับถอยหลัง
			startingCountdownTimer = setTimeout(startingCountdown, 1000, duration, ticks + 1);	//ลดววิเรื่อยๆ
		} else {	//ถ้าเวลาเหลือ 0
			updateAnnouncement('Game starting now');
			initialize();	//เข้าฟังก์ชันแจกโรลตอนเริ่มเกม
		}
	} else {	//คนยังไม่ครบ
		state = 0;
		updateAnnouncement('Waiting on ' + (reqPlayers - numClients) + ' more players');
	}
}

//เช็คว่าถ้าทุกคนที่กำหนดโหวตครบแล้ว ให้จบวันหรือคืนโดยไม่ต้องรอเวลา
function hasEveryoneVoted () {
	var votedFlag = true;
	if (state === 1) {
		io.sockets.clients('alive').forEach(function (socket) {
			if (socket.game_role.power && !socket.game_hasPowerVoted) {
				votedFlag = false;
			} else if (socket.game_role.group == 'mafia' && !socket.game_hasVoted) {
				votedFlag = false;
			}
		});
	} else if (state === 2) {
		io.sockets.clients('alive').forEach(function (socket) {
			if (!socket.game_hasVoted) {
				votedFlag = false;
			}
		});
	}

	return votedFlag;
}

// ?
module.exports = {
	countdfownTime: 0, //time before game starts once enough players have joined (in seconds)
	checkNumPlayers: function() {
		var validClients = io.sockets.clients();
		validClients = validClients.filter(function (socket) {
			return (socket.game_nickname);
		});
		var numClients = validClients.length;
		var reqPlayers = playerRoles.length;
		if(numClients >= reqPlayers) {
			updateAnnouncement('Required number of players reached');
			state = -1;
			startingCountdownTimer = setTimeout(startingCountdown, 1000, this.countdownTime, 0);
		} else {
			updateAnnouncement('Waiting on ' + (reqPlayers - numClients) + ' more players');
			clearTimeout(startingCountdownTimer);
		}
		updateHeader('');
	},
	filterMessage: function(socket, data) {
		var clientRooms = io.sockets.manager.roomClients[socket.id];

		if (data.message[0] !== '/') {
			if (state === 0 || state === -1 || (state === 2 && socket.game_alive)) {
				io.sockets.emit('message', data);
			} else if (clientRooms['/spectator'] || !socket.game_alive) {
				data.message = '<font color="red">' + data.message + '</font>';
				io.sockets.in('spectator').emit('message', data);
			} else if (state === 1) {
				if (clientRooms['/mafia']) {
					io.sockets.in('mafia').emit('message', data);
				}
			}
		} else {
			var validCommand = false;

			//again will probably replace this with something that iterates through a list that gets built on startup
			//so people will be able to add their own chat commands without actually modifying the source
			if (wills && data.message.indexOf('/will ') === 0) {
				var willText = data.message.replace('/will ','');

				var maxWillLength = 140;
				if (willText.length > 0) {
					if (willText.length < maxWillLength) {
						socket.game_will = willText;
						socket.emit('message', { message: 'Your will has been revised.' });
					} else {
						socket.emit('message', { message: 'Please keep your will under ' + maxWillLength + ' characters.' });
					}
				} else {
					socket.emit('message', { message: 'Usage: /will [your will content]' });
				}

				validCommand = true;
			}

			if (!validCommand)
				socket.emit('message', { message: 'Command was not recognized.' });
		}
	},
	vote: function(socket, data) {
		data.username = socket.game_nickname;

		var isValid = true;
		var clientRooms = io.sockets.manager.roomClients[socket.id];
		if (!socket.game_role.power) {
			if (state === 1 && clientRooms['/mafia']) {
				io.sockets.in('mafia').emit('playerVote', data);
			} else if (state === 2) {
				io.sockets.emit('playerVote', data);
			} else {
				isValid = false;
			}
		} else {
			if (state === 1) {
				socket.game_powerVote = data.message;
			} else if (state === 2) {
				io.sockets.emit('playerVote', data);
			} else {
				isValid = false;
			}
		}

		if (isValid) {
			if (!socket.game_role.power || state === 2) {
				socket.game_vote = data.message; //this will have to be reworked once mafia power roles are introduced
				socket.game_hasVoted = true;
			} else {
				socket.game_hasPowerVoted = true;
			}

			if (hasEveryoneVoted()) {
				endDay = true;
			}
		}
	},
	state: function() {
		return state;
	},
	announcement: function() {
		return announcement;
	},
	header: function () {
		return header;
	},
	enableWills: function () {
		wills = true;
	}
};
