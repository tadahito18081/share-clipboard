//
//  Share Clipboard
//
//  Created by Coral Wu on 2014-05-10.
//  Copyright (c) 2014 Langui.net
//

var net = require('net');
var clipboard = require("copy-paste");

var port = 7582;
var peers = [];
var lastClipboardText = '';

// check and push clipboard text to other peers
function checkAndPushText() {
	//console.log('checkAndPushText');
	var clipboardText = clipboard.paste();
	if (clipboardText == lastClipboardText
		|| clipboardText.length == 0
		|| peers.length == 0) {
		return;
	}
	// create message
	var messageLength = Buffer.byteLength(clipboardText, 'utf8') + 8;
	// 非推奨のnew Buffer()を置き換え
	var messageData = Buffer.alloc(messageLength);
	// message length
	messageData.writeInt32BE(messageLength, 0);
	// clipboard type
	messageData.write("\x00\x00\x00\x01", 4);
	messageData.write(clipboardText, 8);

	for (var i = 0; i < peers.length; i++) {
		var socket = peers[i];
		socket.write(messageData);
	}
	lastClipboardText = clipboardText;
	// checkAndPushText関数内にデバッグログを追加
	//console.log('Original text length:', clipboardText.length);
	//console.log('UTF-8 byte length:', Buffer.byteLength(clipboardText, 'utf8'));
	//console.log('Total message length:', messageLength);
}
// checks every 1 second
var checkTimer = setInterval(checkAndPushText, 1000);

// connect to a server
if (process.argv.length == 3) {
	var host = process.argv[2];
	var client = net.connect({ port: port, host: host },
		function() { //'connect' listener
			//console.log('client connected');
			// add client to the list
			peers.push(client);
			checkAndPushText();
		});
	client.on('data', function(data) {
		//console.log(data.toString());
		//client.end();
		writeToClipboard(data);
	});
	client.on('end', function() {
		//console.log('client disconnected');
		var index = peers.indexOf(client);
		if (index > -1) {
			//console.log('remove client');
			peers.splice(index, 1);
		}
	});
	client.on('error', function() {
		//console.log('client error');
		var index = peers.indexOf(client);
		if (index > -1) {
			//console.log('remove client');
			peers.splice(index, 1);
		}
	});
}

function writeToClipboard(data) {
	try {
		if (data.length <= 8) return;

		const expectedLength = data.readInt32BE(0);
		if (data.length !== expectedLength) {
			console.error(`Invalid message length. Expected: ${expectedLength}, Got: ${data.length}`);
			return;
		}

		const text = data.toString('utf8', 8);
		clipboard.copy(text);
	} catch (err) {
		console.error('Error processing clipboard data:', err);
	}
}

var server = net.createServer(function(socket) {
	// add client to the list
	peers.push(socket);

	// broadcast the data
	// チャンクを保持するバッファを追加
	let receivedData = Buffer.alloc(0);

	socket.on('data', function(chunk) {
		// 新しいチャンクを既存のデータに追加
		receivedData = Buffer.concat([receivedData, chunk]);

		// 完全なメッセージを処理
		while (receivedData.length >= 8) { // ヘッダーサイズ以上あるか確認
			const expectedLength = receivedData.readInt32BE(0);

			// 完全なメッセージを受信できているか確認
			if (receivedData.length >= expectedLength) {
				// メッセージを抽出
				const messageData = receivedData.slice(0, expectedLength);
				// 残りのデータを保持
				receivedData = receivedData.slice(expectedLength);

				// メッセージを処理
				writeToClipboard(messageData);
			} else {
				// 完全なメッセージを受信するまで待機
				break;
			}
		}
	});

	// remove client from the list
	socket.on('end', function() {
		var index = peers.indexOf(socket);
		if (index > -1) {
			//console.log('remove client');
			peers.splice(index, 1);
		}
		//console.log('client disconnected');
	});

	// error handling
	socket.on('error', function(err) {
		//console.log('Caught error');
		var index = peers.indexOf(socket);
		if (index > -1) {
			//console.log('remove client');
			peers.splice(index, 1);
		}
	});
});

// port 7582 is used by Share Clipboard
server.listen(port, function() { //'listening' listener
	console.log("server started");
});
