// Application code for the Evothings client.

// Debug logging used when developing the app in Evothings Studio.
if (window.hyper && window.hyper.log) { console.log = hyper.log; console.error = hyper.log }

// Constants.
var BROADCAST_INTERVAL = 2000
var SERVER_DISCOVERY_TIMEOUT = 6000
var CONNECT_TIMEOUT = 15000

// Application object.
var app = {}

// List of found servers.
app.serverList = {}

// The local UDP socket id.
app.socketId = -1

// Timer used to periodically broadcast a server scan request.
app.broadcastTimer = null

// Timer used to check if any servers are found within a
// certain time limit.
app.serverDiscoveryCheckTimer = null

app.initialize = function()
{
	document.addEventListener('deviceready', app.onDeviceReady, false)

	// Page navigation.
	$('#info_button').bind('click', {articleId: 'info'}, app.showArticle)

	evothings.scriptsLoaded(function()
	{
		FastClick.attach(document.body)

		//app.showCachedApps()

		/* Add a clear button to input fields. */
		/*$('input').each(function() {
			var $input_field = $(this)

			$input_field.bind('focus', function() {
				var $clear_button = $('<button class="clear softred">X</button>')
				$(this).after($clear_button)
				$clear_button.bind('click', function () {
					$input_field.val('').focus()
				})
			})

			$input_field.bind('blur', function() {
				var $field = $(this)
				//  Use a delay to make sure that the button isn't removed
				//	before it's clicked.
				setTimeout(function() {
					$field.siblings('button.clear').remove()
				}, 0)
			})
		})*/
	})
}

/*
Format of app-list.json:
{
	"apps": {
		<name>: {
			"url": <string>
			"index": <string>
		},
		...
	},
}

The name of an app may contain spaces and other weird characters, and is therefore not suitable for filenames or URLs.
It is, however, the app's unique identifier, and must therefore be the key in the "apps" table.
*/

app.showCachedApps = function()
{
	$('#hyper-cache-message').html("Fetching cache list...")
	$.ajax("evocachemeta:app-list.json")
	.done(function(data, textStatus, xhr)
	{
		//console.log(JSON.stringify(data))
		var cachedApps = data["apps"]

		if (!cachedApps)
		{
			var msg = 'No apps cached.'
			$('#hyper-cache-message').html(msg)
		}
		else if(Object.keys(cachedApps).length == 0)
		{
			var msg = Object.keys(cachedApps).length+' apps cached.'
			$('#hyper-cache-message').html(msg)
		}
		else
		{
			var list = ''
			var count = 0
			for(var appName in cachedApps)
			{
				var cachedApp = cachedApps[appName]
				list +=
					'<li class="arrow" id="ca'+count+'"><a href="'+cachedApp.url+'">' +
					'<strong>'+appName+'</strong>' +
					'</a></li>'
				count += 1
			}
			$('#hyper-cache-list').html(list)
			$('#hyper-cache-message').html("")
			count = 0
			for(var appName in cachedApps)
			{
				var cachedApp = cachedApps[appName];
				// wrap variables in function to avoid for-loop madness.
				(function(_appName, _cachedApp, _count)
				{
					// longpress pops up a menu with DELETE <todo: and some other (info) choices>.
					app.longPress('ca'+_count, function() { app.showCachedAppMenu(_appName, _cachedApp); });
				})(appName, cachedApp, count);
				count += 1
			}
		}
	})
	.fail(function(xhr, textStatus, errorThrown)
	{
		$('#hyper-cache-nessage').html("ajax fail")
		var msg = "$.ajax.fail2("+textStatus+", "+errorThrown+")"
		console.log(msg)
	})
	app.longPress('hyper-cache-title', function() {})
}

app.createMenu = function()
{
	var bg = document.createElement('div')
	bg.id = 'hyper-cached-app-background'
	bg.style.width = '100%'
	bg.style.height = '100%'
	bg.style.left = '0'
	bg.style.top = '0'
	bg.style.position = 'absolute'
	bg.style.background = 'rgba(0,0,0,0.5)'
	bg.style.visibility = 'visible'
	bg.style.zIndex = '999998'

	// remove the menu if you click on the background.
	bg.addEventListener('click', function()
	{
		document.body.removeChild(bg)
	})

	// create the menu itself
	var menu = document.createElement('div')

	menu.id = 'hyper-cached-app-menu'
	menu.style.width = '80%'
	menu.style.position = 'absolute'
	menu.style.left = '5%'
	menu.style.bottom = '40%'
	menu.style.padding = '5% 5%'
	menu.style.borderRadius = '4%'
	menu.style.MozBorderRadius = '4%'
	menu.style.WebkitBorderRadius = '4%'
	menu.style.background = '#FFFFFF'
	menu.style.opacity = '1'
	menu.style.border = '1px solid #000000'
	menu.style.fontFamily = 'sans-serif'
	menu.style.fontSize = '18pt'
	menu.style.fontWeight = 'bold'
	menu.style.color = '#000000'
	menu.style.textAlign = 'center'
	menu.style.visibility = 'visible'
	menu.style.zIndex = '999999'

	bg.appendChild(menu)
	document.body.appendChild(bg)

	return menu
}

app.createMenuItem = function(data)
{
	var item = document.createElement('div')
	item.innerHTML = data.text
	// we want the background to be removed here, but its own click handler will take care of that.
	item.addEventListener('click', data.action)
	return item
}

// pop up a yes/cancel dialog box. call yesFunction if the user clicks "yes".
app.yesOrCancel = function(questionText, yesFunction)
{
	return function()
	{
		var resultCallback = function(buttonIndex)
		{
			if(buttonIndex == 1)
				yesFunction()
		}
		navigator.notification.confirm(questionText, resultCallback)
	}
}

app.showCachedAppMenu = function(appName, cachedApp)
{
	var menuItems =
	[
		{
			text: 'DELETE',
			action: app.yesOrCancel("Delete "+appName+"?", function() { window.location.replace('evocachemeta:delete/'+cachedApp.index); }),
		},
	]

	var menu = app.createMenu()

	for(var i in menuItems)
	{
		var item = app.createMenuItem(menuItems[i])
		menu.appendChild(item)
	}
}

app.longPress = function(id, callback)
{
	var pressTimer
	var el = document.getElementById(id)

	el.addEventListener('touchend', function()
	{
		el.style.backgroundColor = "#f3f3f3"
		clearTimeout(pressTimer)
		// Clear timeout
		return false;
	})
	el.addEventListener('touchstart', function()
	{
		el.style.backgroundColor = "#656565"
		// Set timeout
		pressTimer = window.setTimeout(function()
		{
			el.style.backgroundColor = "#f3f3f3"
			callback()
		}, 1000)
		return false;
	})
}

app.onDeviceReady = function()
{
	// Display the last used ip address.
	app.setSavedIpAddress()

	// Networking API won't work until device is ready.
	// The Scan button is blank initially, and the text
	// of the button is set here, when device is ready.
	// TODO: Would be better to diable the button and
	// enable it when device is ready?
	app.setScanButtonStateToReadyToScan()
}

// Set the url field to the saved value.
app.setSavedIpAddress = function()
{
	document.getElementById("hyper-url").value =
		localStorage.getItem('hyper-saved-url')
		|| '192.168.0.x'

}

app.connect = function()
{
	// Get contents of url text field.
	var ip = document.getElementById("hyper-url").value

	// Add protocol and port if needed.
	var url = app.parseIpAddress(ip)

	// Save the URL.
	localStorage.setItem('hyper-saved-url', url)

	// Open URL.
	app.connectTo(url)
}

// Function called when the SCAN button is pressed.
// This function has local functions that performs broadcasting
// and receiving of server scan information.
// For documentation of chrome.sockets.udp see this page:
// https://developer.chrome.com/apps/sockets_udp
app.scan = function()
{
	// Helper function.
	function stringToBuffer(string)
	{
		var buffer = new ArrayBuffer(string.length)
		var bufferView = new Uint8Array(buffer);
		for (var i = 0; i < string.length; ++i)
		{
			bufferView[i] = string.charCodeAt(i)
		}
		return buffer
	}

	// Helper function.
	function bufferToString(buffer)
	{
		var string = ''
		var view = new Uint8Array(buffer)
		for (var i = 0; i < buffer.byteLength; ++i)
		{
			string += String.fromCharCode(view[i])
		}
		return string
	}

	// Bind UDP socket.
	function bind()
	{
		chrome.sockets.udp.bind(
			app.socketId,
			null,
			0,
			function(result)
			{
				// Result 0 means success, negative is error.
				if (result <= 0)
				{
					// Broadcast UDP packet.
					send()

					// Create timer that does continuous broadcast.
					app.createBroadcastTimer(function() { send() })

					// Create discovery timer.
					app.createServerDiscoveryCheckTimer()

					// Start receiving data.
					chrome.sockets.udp.onReceive.addListener(recv)
				}
				else
				{
					console.log('EvothingsClient: Bind of socket failed')
					app.destroySocketAndTimers()
					app.setScanButtonStateToError()
					app.showMessageCouldNotScan()
				}
			})
	}

	// Broadcast scan packet.
	function send()
	{
		chrome.sockets.udp.send(
			app.socketId,
			stringToBuffer('hyper.whoIsThere'),
			'255.255.255.255',
			4088,
			function(sendInfo)
			{
				if (sendInfo.resultCode < 0)
				{
					console.log('EvothingsClient: chrome.sockets.udp.send error: ' +
						sendInfo.resultCode)
					app.destroySocketAndTimers()
					app.setScanButtonStateToError()
					app.showMessageCouldNotScan()
				}
			})
	}

	// Handle incoming UPD packet.
	function recv(recvInfo)
	{
		try
		{
			// Found a server, destroy discovery timer.
			app.destroyServerDiscoveryCheckTimer()

			// Add server info to list.
			var ip = recvInfo.remoteAddress
			var data = JSON.parse(bufferToString(recvInfo.data))
			data.url = 'http://' + ip + ':' + data.port
			data.ipAndPort = ip + ':' + data.port
			app.serverList[ip] = data
			app.displayServers()
		}
		catch (err)
		{
			console.log('EvothingsClient: recv error: ' + err)
			app.destroySocketAndTimers()
			app.setScanButtonStateToError()
			app.showMessageCouldNotScan()
		}
	}

	// Main entry point called at the end of the scan function.
	function startBroadcasting()
	{
		// Scan is not available on Windows Phone.
		if (hyper.isWP())
		{
			console.log('EvothingsClient: Scan is not available on Windows Phone')
			return
		}

		// Kill timers and return if scan is already in progress.
		if (app.broadcastTimer != null)
		{
			app.destroySocketAndTimers()
			app.setScanButtonStateToNormal()
			return
		}

		// Clear server list.
		app.serverList = {}

		// Clean up existing scan if any.
		app.destroySocketAndTimers()

		// Clear the list of servers.
		$('#hyper-server-list').html('')

		// Set button state.
		app.setScanButtonStateToScanning()

		try
		{
			// Open connection, create UDP socket.
			chrome.sockets.udp.create({}, function(createInfo)
			{
				app.socketId = createInfo.socketId
				bind()
			})
		}
		catch (err)
		{
			console.log('EvothingsClient: Failed to create UDP socket: ' + err)
			app.destroySocketAndTimers()
			app.showMessageCouldNotScan()
			app.setScanButtonStateToNormal()
		}
	}

	// Call function that starts scanning for servers.
	startBroadcasting()
}

app.connectTo = function(url)
{
	// Clean up.
	app.destroySocketAndTimers()

	// If the new page has not loaded within a certain time,
	// we consider it an error and display a message.
	app.createConnectTimer()

	// Set button to 'Connecting' state.
	app.setConnectButtonStateToConnecting()

	// Open the url.
	window.location.assign(url)
}

// Add protocol and port if needed.
app.parseIpAddress = function(ip)
{
	var url = ip.trim()

	if (!url.match('^https?://[A-Z0-9\.]*.*$'))
	{
		// Add protocol.
		url = 'http://' + url
	}

	if (url.match('^https?://[0-9\.]*$') &&
		!url.match('^https?://[0-9\.]*:[0-9]*$') )
	{
		// Add port to numeric ip address.
		url = url + ':4042'
	}

	return url
}

app.displayServers = function()
{
	var servers = app.serverList

	var list = '' //'<li data-role="list-divider" data-theme="a">EvoThings Studio Servers</li>'

	if (servers.length <= 0)
	{
		list +=
			'<li>'
			+	'<h2>No servers found</h2>'
			+ '</li>'
	}
	else
	{
		for (var key in servers)
		{
			var server = servers[key]
			list +=
				'<li class="arrow" onclick="app.connectTo(\'' +
				server.url + '\')"><a>' +
				'<strong>Touch here to connect to:</strong><br/>' +
				server.name + '<br/>' +
				'<small>' + server.ipAndPort + '</small><br/>' +
				'</a></li>'
		}
	}

	$('#hyper-server-list').html(list)
}

app.destroySocketAndTimers = function()
{
	app.destroyBroadcastTimer()

	app.destroyServerDiscoveryCheckTimer()

	if (app.socketId > -1)
	{
		chrome.sockets.udp.close(app.socketId)
		app.socketId = -1
	}
}

app.createBroadcastTimer = function(scanFunction)
{
	app.destroyBroadcastTimer()
	app.broadcastTimer = setInterval(scanFunction, BROADCAST_INTERVAL)
}

app.destroyBroadcastTimer = function()
{
	if (app.broadcastTimer)
	{
		clearInterval(app.broadcastTimer)
		app.broadcastTimer = null
	}
}

app.createServerDiscoveryCheckTimer = function()
{
	app.destroyServerDiscoveryCheckTimer()
	app.serverDiscoveryCheckTimer = setTimeout(
		function() { app.showMessageNoServersFound() },
		SERVER_DISCOVERY_TIMEOUT)
}

app.destroyServerDiscoveryCheckTimer = function()
{
	if (app.serverDiscoveryCheckTimer)
	{
		clearTimeout(app.serverDiscoveryCheckTimer)
		app.serverDiscoveryCheckTimer = null
	}
}

app.createConnectTimer = function()
{
	// If connection is not made within the timeout
	// period, an error message is shown.
	setTimeout(function()
		{
			app.destroySocketAndTimers()
			app.showMessageCouldNotConnect()
			app.setConnectButtonStateToNormal()
		},
		CONNECT_TIMEOUT)
}

app.showMessageNoServersFound = function()
{
	var title = 'No Workbench found'
	var message = 'Please check that your network allows UDP broadcasting. You can also try connecting by entering the Workbench IP-address and press the CONNECT button.'
	var button = 'OK'
	navigator.notification.alert(
    	message,
    	function() {}, // callback
    	title,
    	button)
}

app.showMessageCouldNotScan = function()
{
	var title = 'Could not start scanning'
	var message = 'Please check that your network allows UDP broadcasting. You can also try connecting by entering the Workbench IP-address and press the CONNECT button.'
	var button = 'OK'
	navigator.notification.alert(
    	message,
    	function() {}, // callback
    	title,
    	button)
}

app.showMessageCouldNotConnect = function()
{
	var title = 'Could not connect'
	var message = 'Please check that the device is online and that your network allows connections. If you entered a URL manually check that it has a valid format.'
	var button = 'OK'
	navigator.notification.alert(
    	message,
    	function() {}, // callback
    	title,
    	button)
}

app.setConnectButtonStateToNormal = function()
{
	$('#hyper-button-connect').html('CONNECT')
}

app.setConnectButtonStateToConnecting = function()
{
	$('#hyper-button-connect').html('CONNECTING...')
}

app.setScanButtonStateToReadyToScan = function()
{
	if (hyper.isWP())
	{
		$('#hyper-button-scan').html('SCAN NOT AVAILABLE')
		$('#hyper-button-scan').css('background', 'rgb(128,128,128)')
		$('#hyper-button-scan').css('border-color', 'rgb(128,128,128)')
		// This does not seem to work.
		$('#hyper-button-scan').button('disable')
	}
	else
	{
		app.setScanButtonStateToNormal()
	}
}

app.setScanButtonStateToNormal = function()
{
	$('#hyper-button-scan').html('SCAN FOR WORKBENCH')
}

app.setScanButtonStateToScanning = function()
{
	$('#hyper-button-scan').html('STOP SCAN')
}

app.setScanButtonStateToError = function()
{
	$('#hyper-button-scan').html('SCAN FAILED')
}

app.openBrowser = function(url)
{
	window.open(url, '_system', 'location=yes')
}

app.showArticle = function(event)
{
	var articlePage = $('article#' + event.data.articleId)

	$('main').toggle()
	articlePage.toggle()

	if (articlePage.is(":visible"))
		$(this).text('Scan for Workbench')
	else
		$(this).text('Info')
}

app.showMain = function()
{
	$('main').show()
	$('article').hide()
	$('#info_button').text('Info')
	$('header button.back').hide()
}

// App main entry point.
app.initialize()

