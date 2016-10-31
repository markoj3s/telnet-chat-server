// Load the TCP Library
net = require('net');

// Keep track of the chat clients and rooms
var clients = {};
var rooms   = {};

// Regular expression
var nameRegex           = /^[a-zA-Z0-9]*$/;
var commandRegex        = /[^\x20-\x7E]+/;

// Users' state list
const STATE_LOGIN         = 1;
const STATE_NEUTRAL       = 2;
const STATE_ROOM          = 3;
const STATE_END           = 4;

// Start a TCP Server
net.createServer(function(socket) {

  // Initialization
  socket.name       = ""              // Username
  socket.state      = STATE_LOGIN;    // Initial state

  // Login prompt
  socket.write("\r\n## Welcome to TRC ##\r\n<Please enter username>\r\n");
  togglePrompt(socket, true);

  //=============================
  //            Events
  //=============================

  // Data input process
  socket.on("data", function(data) {
    var buffer = data.toString().replace(/\r?\n|\r/,""); //remove line breaks from string

    // Return if the buffer is empty or just contains whitespace
    if (buffer.replace(/\s/g, "").length < 1) {
      return;
    }

    // Only allow "special inputs" like commands upon login
    if (socket.state === STATE_LOGIN) {
      login(buffer);
    } else {
      checkInput(buffer);
    }

    // Display prompt if user still connected
    if (socket.state !== STATE_END) {
      togglePrompt(socket, true);
    }
  });

  // Disconnection process
  socket.on('end', function () {
    delete clients[socket.name];
    // In case of broken socket
    if (socket.room && rooms[socket.room].hasOwnProperty(socket.name)) {
      delete rooms[socket.room][socket.name];
    }
  });

  //=============================
  //            Methods
  //=============================

  // Toggle the prompt
  function togglePrompt(targetSocket, promptFlg) {
    if (promptFlg) {
      targetSocket.write("> ");
    } else {
      targetSocket.write("\b\b");
    }
  }
  
  // Send a message to all clients
  function broadcastMessage(message) {
    // // Raise an error if the user hasn't joined any room
    if (socket.state !== STATE_ROOM) {
      socket.write("ERROR: Please create or join a room first.\r\n");
      return;
    }

    for (key in rooms[socket.room]) {
      // Skip the user himself
      if (rooms[socket.room][key] === socket) {
        continue;
      }
      
      // If broken socket, remove it from the member list and skip
      if (rooms[socket.room][key].destroyed) {
        delete rooms[socket.room][key];
        continue;
      }

      // Display the sender's message
      togglePrompt(rooms[socket.room][key], false);
      rooms[socket.room][key].write(message + "> ");
    }
  }

  // Process the user's input
  function checkInput(input) {
    // Raise an error if illegal character was used
    if (commandRegex.test(input)) {
      socket.write("ERROR: Unallowed character found.\r\n");
      return;
    }

    // If the input starts with a slash, process it as a command, otherwise like a message
    if (input[0] === "/") {
      executeCommand(input);
    } else {
      broadcastMessage(socket.name + ": " + input + "\r\n");
    }
  }

  // Find the command type and execute it
  function executeCommand(command) {

    var commandName     = command;
    var commandDetail   = "";

    // Extract the command details
    var index = command.indexOf(" ");
    if (index !== -1) {
      var commandName     = command.slice(0, index);
      var commandDetail   = command.slice(index+1, command.length);
    }

    // Analyze the name of the command
    switch (commandName) {
      // Display the room list
      case "/help":
        showCommandList();
        break;
      // Display the room list
      case "/rooms":
        showRoomList();
        break;
      // Create the room
      case "/create":
        createRoom(commandDetail);
        break;
      // Join the room
      case "/join":
        joinRoom(commandDetail);
        break;
      // Display the current room's member list
      case "/members":
        showMemberList();
        break;
      // Display the current room's member list
      case "/msg":
        sendPrivateMessage(commandDetail);
        break;
      // Leave the current room
      case "/leave":
        leaveRoom();
        break;
      // Exit the chat
      case "/quit":
        leaveChat();
        break;
      default:
        socket.write("ERROR: Unknown command.\r\n");
        break;
    }
  }

  // Log the user in
  function login(input) {
    // Return if contains illegal characters
    if (!nameRegex.test(input)) {
      socket.write("ERROR: Unallowed username.\r\n<Please enter username>\r\n");
      return;
    }

    // Raise an error if the username was already taken
    if (clients[input]) {
      socket.write("ERROR: Name already taken.\r\n<Please enter username>\r\n");
      return;
    }

    // Login process
    clients[input]    = socket;
    socket.state      = STATE_NEUTRAL;
    socket.name       = input;

    socket.write("\r\n-> Welcome " + socket.name + "!\r\n-> To display the list of commands, please hit: /help\r\n");
  }

   // Display the command list
  function showCommandList() {
    socket.write("-> Command list:\r\n");
    socket.write("* to display the room list:   /rooms\r\n");
    socket.write("* to create a room:           /create 'nameOfTheRoom'\r\n");
    socket.write("* to join a room:             /join 'nameOfTheRoom'\r\n");
    socket.write("* to display room members:    /members\r\n");
    socket.write("* to send a private message:  /msg 'recipientName' 'message'\r\n");
    socket.write("* to leave the current room:  /leave\r\n");
    socket.write("* to leave the chat:          /quit\r\n");
    socket.write("-> End of list\r\n");
  }

  // Display the existing room list
  function showRoomList() {
    // Raise an error if the room already exists
    if (socket.state === STATE_ROOM) {
      socket.write("ERROR: You already joined a room.\r\n");
      return
    }

    // If no room exists
    if (Object.keys(rooms).length < 1) {
      socket.write("-> There are no existing rooms\r\n");
      return;
    }

    //Display active rooms
    socket.write("-> Active rooms are:\r\n");
    for (key in rooms) {
      socket.write("* " + key + "(" + Object.keys(rooms[key]).length + ")\r\n");
    }
    socket.write("-> End of list\r\n");
  }

  // Display the current room's member list
  function showMemberList() {
    // Raise an error if the user hasn't joined a room yet
    if (socket.state !== STATE_ROOM) {
      socket.write("ERROR: You have to join a room first.\r\n");
      return;
    }

    // Display room members
    socket.write("-> People in the room are:\r\n");
      for (key in rooms[socket.room]) {
        if (socket === rooms[socket.room][key]) {
          socket.write("* " + key + "(you)\r\n");
        } else {
          socket.write("* " + key + "\r\n");
        }
      }
    socket.write("-> End of list\r\n");
  }

  // Create a new room
  function createRoom(roomName) {
    // Raise an error if a room is already joined
    if (socket.state === STATE_ROOM) {
      socket.write("ERROR: You already joined a room.\r\n");
      return
    }

    // Raise an error if the room already exists
    if (rooms.hasOwnProperty(roomName)) {
      socket.write("ERROR: The room '" + roomName + "' already exists.\r\n");
    }

    // Raise an error if no room name or invalid name
    if (roomName.replace(/\s/g, "").length < 1 || !nameRegex.test(roomName)) {
      socket.write("ERROR: Please enter a valid room name.\r\n");
      return;
    }

    // Room creation process
    socket.room     = roomName;
    socket.state    = STATE_ROOM;
    rooms[roomName] = {};
    rooms[roomName][socket.name] = socket;
    socket.write("-> You created and joined the room '" + roomName + "'\r\n");
  }

  // Join an existing room
  function joinRoom(roomName) {
    // Raise an error if a room is already joined
    if (socket.state === STATE_ROOM) {
      socket.write("ERROR: You already joined a room.\r\n");
      return
    }

    // Raise an error if no room name
    if (roomName.replace(/\s/g, "").length < 1) {
      socket.write("ERROR: Please enter a room name.\r\n");
      return;
    }

    // Raise an error if the room doesn't exists
    if (!rooms.hasOwnProperty(roomName)) {
      socket.write("ERROR: The room '" + roomName + "' doesn't exist.\r\n");
      return
    }

    // Make the user join the room
    socket.room   = roomName;
    socket.state  = STATE_ROOM;
    rooms[roomName][socket.name] = socket;
    socket.write("-> You joined the room '" + roomName + "'\r\n");
    showMemberList();
    broadcastMessage("-> '" + socket.name + " joined the room\r\n");
  }

  // Send a private message to the target user
  function sendPrivateMessage(input) {
    // Raise an error if the user hasn't joined any room
    if (socket.state !== STATE_ROOM) {
      socket.write("ERROR: Please create or join a room first.\r\n");
      return;
    }

    // Raise an error if no command detail provided
    if (input.replace(/\s/g, "").length < 1) {
      socket.write("ERROR: Invalid command.\r\n");
      return;
    }

    var recipient = "";
    var message   = "";

    var index = input.indexOf(" ");
    // Raise an error if the PM feature is misused
    if (index === -1) {
      socket.write("ERROR: Invalid command.\r\n");
      return;
    }
    
    // Get the recipient and message from the input
    recipient = input.slice(0, index);
    message   = input.slice(index+1, input.length);

    // Raise an error if the recipient is not in the room
    if (!rooms[socket.room].hasOwnProperty(recipient)) {
      socket.write("ERROR: No such user in that room.\r\n");
      return;
    }

    // Raise an error if no message was sent through the PM feature
    if (message.replace(/\s/g, "").length < 1) {
      socket.write("ERROR: Please enter a message.\r\n");
      return;
    }

    // Raise an error if send a PM to oneself
    if (socket.name === recipient) {
      socket.write("ERROR: You can't send a PM to yourself.\r\n");
      return;
    }

    // Display the sender's message
    togglePrompt(rooms[socket.room][recipient], false);
    rooms[socket.room][recipient].write("[PM]" + socket.name + ": " + message + "\r\n> ");
  }

  // Leave the room
  function leaveRoom() {
    // Raise an error if the user hasn't joined any room
    if (socket.state !== STATE_ROOM) {
      socket.write("ERROR: Please create or join a room first.\r\n");
      return;
    }

    // Remove the user from the room, and delete the room if it becomes empty
    delete rooms[socket.room][socket.name];
    if (Object.keys(rooms[socket.room]).length < 1) {
      delete rooms[socket.room];
    }

    // Make the user leave the room
    socket.write("-> You left the room '" + socket.room + "'\r\n");
    broadcastMessage("-> '" + socket.name + "' left the room\r\n");
    socket.state  = STATE_NEUTRAL;
    socket.room   = "";
  }

  // Leave the chat
  function leaveChat() {
    socket.state  = STATE_END;
    socket.end("-> See You Space Cowboy!\r\n");
  }

}).listen(5000);

console.log("Server running at port 5000\r\n");