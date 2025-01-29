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
	var clipboardText = clipboard.paste();
	if (clipboardText == lastClipboardText
		|| clipboardText.length == 0
		|| peers.length == 0) {
		return;
	}

	// より大きなバッファサイズを確保
	var messageLength = Buffer.byteLength(clipboardText, 'utf8') + 8;
	var messageData = Buffer.allocUnsafe(messageLength);

	// メッセージ長を書き込み
	messageData.writeInt32BE(messageLength, 0);
	// クリップボードタイプを書き込み
	messageData.write("\x00\x00\x00\x01", 4);
	// データを書き込み
	messageData.write(clipboardText, 8);

	// 各ピアにデータを送信
	peers.forEach(function(socket) {
		// 書き込みバッファが一杯になるのを防ぐため、ドレイン処理を追加
		if (!socket.write(messageData)) {
			socket.once('drain', function() {
				// バッファが空になったら再開
			});
		}
	});

	lastClipboardText = clipboardText;
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
	//console.log('writeToClipboard');
	if (data.length <= 8)
		return;
	// we simply skip the 8 bytes header
	var text = data.toString('utf8', 8);
	//console.log(text);
	clipboard.copy(text);
}

var server = net.createServer(function(socket) {
	// add client to the list
	peers.push(socket);
	// 1. まず、受信バッファを管理するための変数を追加
	var receivedData = Buffer.alloc(0);
	var expectedLength = -1;

	// broadcast the data
	// 2. データ受信処理を修正
	socket.on('data', function(chunk) {
		// 受信データを連結
		receivedData = Buffer.concat([receivedData, chunk]);

		// ヘッダーの処理
		while (receivedData.length >= 8) { // ヘッダーサイズは8バイト
			if (expectedLength === -1) {
				// メッセージ長を取得
				expectedLength = receivedData.readInt32BE(0);
			}

			// 完全なメッセージを受信したか確認
			if (receivedData.length >= expectedLength) {
				// 完全なメッセージを取得
				var completeMessage = receivedData.slice(0, expectedLength);

				// 残りのデータを保持
				receivedData = receivedData.slice(expectedLength);

				// メッセージを処理
				for (var i = 0; i < peers.length; i++) {
					var client = peers[i];
					if (client != socket) {
						client.write(completeMessage);
					} else {
						writeToClipboard(completeMessage);
					}
				}

				// 次のメッセージのために初期化
				expectedLength = -1;
			} else {
				// まだ完全なメッセージを受信していない
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
