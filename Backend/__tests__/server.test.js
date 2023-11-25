const io = require("socket.io-client");
const { server, db } = require("../server.js");
const { gameManager } = require("../app.js");
const MockUserDBManager = require("../models/__mocks__/UserDBManager.js");
const UserDBManager = require("../models/UserDBManager.js");
const Player = require("../models/Player.js");
const User = require("../models/User.js");
const GameRoom = require("../models/GameRoom.js");
const Settings = require("../models/Settings.js");
const GameManager = require("../models/GameManager.js");
const Question = require("../models/Question.js");

jest.mock("../models/UserDBManager.js");
jest.mock("../models/GameManager.js");

// Helper function for manually failing a test
function fail(message) {
  console.log("[TEST FAILED]: " + message);
  expect(1).toBe(2);
}

describe("Server", () => {
  const userA = new User("token-A", "username-A", 2, "sessionToken-A");
  const userB = new User("token-B", "username-B", 5, "sessionToken-B");

  const gameMasterA = new Player(userA);
  const gameMasterB = new Player(userB);

  const roomASettings = new Settings();
  const roomBSettings = new Settings();

  const roomA = new GameRoom(
    "roomId-A",
    gameMasterA,
    "roomCode-A",
    roomASettings
  );
  const roomB = new GameRoom(
    "roomId-B",
    gameMasterB,
    "roomCode-B",
    roomBSettings
  );

  let clientA;
  let clientB;
  let undefinedSessionTokenClient;
  let invalidSessionTokenClient;

  beforeAll((done) => {
    undefinedSessionTokenClient = io.connect("https://127.0.0.1:8081", {
      reconnection: false,
      "reopen delay": 0,
      "force new connection": true,
      transports: ["websocket"],
      rejectUnauthorized: false,
    });

    invalidSessionTokenClient = io.connect("https://127.0.0.1:8081", {
      reconnection: false,
      "reopen delay": 0,
      "force new connection": true,
      transports: ["websocket"],
      rejectUnauthorized: false,
      query: "sessionToken=asdfjkl;",
    });

    clientA = io.connect("https://127.0.0.1:8081", {
      "reconnection delay": 0,
      "reopen delay": 0,
      "force new connection": true,
      transports: ["websocket"],
      rejectUnauthorized: false,
      query: `sessionToken=${userA.sessionToken}`,
    });

    clientB = io.connect("https://127.0.0.1:8081", {
      "reconnection delay": 0,
      "reopen delay": 0,
      "force new connection": true,
      transports: ["websocket"],
      rejectUnauthorized: false,
      query: `sessionToken=${userB.sessionToken}`,
    });

    const connectClient = (client) => {
      return new Promise((resolve, reject) => {
        client.on("connect", () => {
          resolve();
        });
        client.on("connect_error", (error) => {
          reject(error);
        });
      });
    };

    const promises = [
      connectClient(undefinedSessionTokenClient),
      connectClient(invalidSessionTokenClient),
      connectClient(clientA),
      connectClient(clientB),
    ];

    Promise.all(promises)
      .then(() => done())
      .catch((error) => {
        console.error("Failed to connect clients:", error);
        done(error);
      });
  });

  afterAll((done) => {
    // Disconnect the clients
    undefinedSessionTokenClient.disconnect();
    invalidSessionTokenClient.disconnect();
    clientA.disconnect();
    clientB.disconnect();

    // Close the database and server and wait for it before calling done
    db.disconnect();
    server.close(() => {
      done();
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    clientA.off();
    clientB.off();
  });

  describe("Socket.io connection", () => {
    /**
     * Input: No sessionToken in socket query
     *
     * Expected behaviour: Disconnect client
     * Expected output: None
     */
    it("should disconnect given no sessionToken", (done) => {
      expect(undefinedSessionTokenClient.connected).toBe(false);
      done();
    });

    /**
     * Input: A sessionToken that does not match a current logged-in user's
     *        session token
     *
     * Expected behaviour: Disconnect client
     * Expected output: None
     */
    it("should disconnect given an invalid sessionToken", (done) => {
      expect(invalidSessionTokenClient.connected).toBe(false);
      done();
    });

    /**
     * Input: A valid sessionToken in socket query
     *
     * Expected behaviour: Connect client successfully
     * Expected output: None
     */
    it("should connect successfully given a valid sessionToken", (done) => {
      expect(clientA.connected).toBe(true);
      expect(clientB.connected).toBe(true);
      done();
    });
  });

  describe("joinRoom event", () => {
    // TODO DELETE ONCE FULLY MADE SURE clientA and clientB are in the same room and will stay in that socket
    it("Test EVENT to make sure clientA and client B are in the same scoket room", (done) => {
      jest.spyOn(GameManager.prototype, "fetchRoomById").mockReturnValue(roomA);
      clientA.emit("joinRoom", {
        username: userA.username,
        roomId: roomA.roomId,
      });
      clientB.emit("joinRoom", {
        username: "username-B",
        roomId: roomA.roomId,
      });
      clientA.on("welcomeNewPlayer", (data) => {
        done();
      });
    });

    /**
     * Input: A roomId that does not exist
     *
     * Expected behaviour: Emit an error event
     * Expected output:
     * {
     *   "message": "The room you are trying to join no longer exists."
     * }
     */
    it("should emit error given a non-existent roomId", (done) => {
      jest
        .spyOn(GameManager.prototype, "fetchRoomById")
        .mockReturnValue(undefined);

      const message = {
        username: userA.username,
        roomId: roomA.roomId,
      };

      clientA.on("error", (data) => {
        expect(data).toEqual({
          message: "The room you are trying to join no longer exists.",
        });
        done();
      });

      clientA.emit("joinRoom", message);
    });

    /**
     * Input: A valid roomId of an existing room. Note that clientB is the
     *        new player, while clientA is an existing player in the room.
     *
     * Expected behaviour: Set clientB as a player in the room. Emit a 
     *                     welcomeNewPlayer event to clientB but not clientA.
     * 
     * Expected output:
     * 
     * welcomeNewPlayer event
        {
          "roomPlayers": [
            {
              "username": userA.username,
              "rank": 2,
              “isReady”: false,
            },
            {
              "username": "username-B",
              "rank": 5,
              “isReady”: false,
            }
          ],
          "roomSettings": {
            "roomIsPublic": false,
            "questionCategories": ["Science", "History"],
            "questionDifficulty": "hard",
            "maxPlayers": 4,
            "questionTime": 20,
            "totalQuestions": 10
          }
          "roomCode": roomCode-A
        }
     */
    it("should emit welcomeNewPlayer to the new player that joined", (done) => {
      jest.spyOn(GameManager.prototype, "fetchRoomById").mockReturnValue(roomA);
      const message = {
        username: userB.username,
        roomId: roomA.roomId,
      };

      roomA.roomSettings.questionCategories = ["Science", "History"];
      roomA.roomSettings.questionDifficulty = "hard";
      roomA.roomSettings.maxPlayers = 4;

      // Setup the same listener with clientA and fail the test if
      // clientA receives the welcomeNewPlayer event.
      clientA.on("welcomeNewPlayer", () => {
        fail("ClientA should not receive welcomeNewPlayer event.");
      });

      clientB.on("welcomeNewPlayer", (data) => {
        console.log(data);
        expect(data.roomPlayers.length).toBe(1);
        expect(data.roomPlayers[0].username).toEqual(userA.username);
        expect(data.roomPlayers[0].rank).toEqual(userA.rank);
        expect(data.roomPlayers[0].isReady).toEqual(false);
        expect(data.roomSettings.roomIsPublic).toBe(false);
        expect(data.roomSettings.questionCategories).toEqual([
          "Science",
          "History",
        ]);
        expect(data.roomSettings.questionDifficulty).toEqual("hard");
        expect(data.roomSettings.maxPlayers).toEqual(4);
        expect(data.roomSettings.questionTime).toEqual(20);
        expect(data.roomSettings.totalQuestions).toEqual(10);
        expect(data.roomCode).toBe(roomA.roomCode);
        console.log(data.possibleCategories);
        done();
      });

      clientB.emit("joinRoom", message);
    });

    /**
     * Input: A valid roomId of an existing room
     *
     * Expected behaviour: Set the player as a player in the room.
     *                     Emit a playerJoined event to the other players
     *                     in the room.
     * Expected output:
     * 
     * playerJoined event
        {
          "newPlayerUsername": "username-B",
          "newPlayerRank": 5
        }
     *  
     */
    it("should emit playerJoined to the players in the room", (done) => {
      jest.spyOn(GameManager.prototype, "fetchRoomById").mockReturnValue(roomA);
      jest
        .spyOn(GameRoom.prototype, "getPlayers")
        .mockReturnValue([userA, userB]);

      const messageB = {
        username: userB.username,
        roomId: roomA.roomId,
      };

      const messageA = {
        username: userA.username,
        roomId: roomA.roomId,
      };

      clientA.on("playerJoined", (data) => {
        console.log(data);

        expect(data.newPlayerUsername).toEqual(userB.username);
        expect(data.newPlayerRank).toEqual(userB.rank);
        done();
      });

      clientB.on("playerJoined", (_) => {
        fail("clientB should not receive the playerJoined event.");
      });

      // setTimeout(() => {
      clientB.emit("joinRoom", messageB);
      // }, 1500);

      // clientA.emit("joinRoom", messageA);
    });
  });

  // leaveRoom event

  // banPlayer event

  describe("change Setting event", () => {

    it("change Setting should return error for invalid room", (done) => {
      const message = {
        roomId: "badRoom",
        settingOption: undefined,
        optionValue: undefined
      };

      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(undefined);

      clientA.emit("changeSetting", message);

      clientA.on("error", (data) => {
        // expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in invalid parameters."});
        done();
      });
      
    })

    it("change Setting should return error for undefined setting Parameter", (done) => {
      const message = {
        roomId: "goodRoom",
        settingOption: undefined,
        optionValue: undefined
      };

      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      clientA.emit("changeSetting", message);

      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in invalid parameters."});
        done();
      });
      
    })

    it("change Setting should return error for undefined option Parameter", (done) => {
      const message = {
        roomId: "goodRoom",
        settingOption: "isPublic",
        optionValue: undefined
      };

      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      clientA.emit("changeSetting", message);

      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in invalid parameters."});
        done();
      });
      
    })

    it("change Setting (isPublic) should return success message for client A and B", (done) => {
      const message = {
        roomId: roomA.roomId,
        settingOption: "isPublic",
        optionValue: true
      };

      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

    

      clientA.emit("changeSetting", message);

      let receieve = 0
      clientA.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "isPublic", optionValue: true});
        if(++receieve === 2) done();
      });
      clientB.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "isPublic", optionValue: true});
        if(++receieve === 2) done();
      });
    })

    it("change Setting (isPublic) should return error for client A, bad value", (done) => {
      const message = {
        roomId: roomA.roomId,
        settingOption: "isPublic",
        optionValue: "1"
      };

      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      clientA.emit("changeSetting", message);

      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in an invalid settings configuration."});
        done();
      });
    })

    it("change Setting (add: category) should return success message for client A and B", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "category-General",
        optionValue: true
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isACategory").mockReturnValue(true);
      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      let receieve = 0
      clientA.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "category-General", optionValue: true});
        if(++receieve === 2) done();
      });
      clientB.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "category-General", optionValue: true});
        if(++receieve === 2) done();
      });
    })

    it("change Setting (remove: category) should return success message for client A and B", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "category-General",
        optionValue: false
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isACategory").mockReturnValue(true);
      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      let receieve = 0
      clientA.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "category-General", optionValue: false});
        if(++receieve === 2) done();
      });
      clientB.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "category-General", optionValue: false});
        if(++receieve === 2) done();
      });
    })

    it("change Setting (category) should return error for client A, bad optionValue", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "category-General",
        optionValue: "ss"
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isACategory").mockReturnValue(true);
      clientA.emit("changeSetting", message);

      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in an invalid settings configuration."});
        done();
      });
    })

    it("change Setting (category) should return error for client A, bad category", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "category-General",
        optionValue: true
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isACategory").mockReturnValue(false);
      clientA.emit("changeSetting", message);

      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in an invalid settings configuration."});
        done();
      });
    })

    it("change Setting (difficulty) should return success message for client A and B", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "difficulty",
        optionValue: "easy"
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isADifficulty").mockReturnValue(true);
      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      let receieve = 0
      clientA.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "difficulty", optionValue: "easy"});
        if(++receieve === 2) done();
      });
      clientB.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "difficulty", optionValue: "easy"});
        if(++receieve === 2) done();
      });
    })

    it("change Setting (difficulty) should return error for client A, bad difficulty", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "difficulty",
        optionValue: "easy"
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isADifficulty").mockReturnValue(false);
      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in an invalid settings configuration."});
        done();
      });
    })

    it("change Setting (maxPlayers) should return success message for client A and B", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "maxPlayers",
        optionValue: 3
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isAMaxPlayers").mockReturnValue(true);
      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      let receieve = 0
      clientA.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "maxPlayers", optionValue: 3});
        if(++receieve === 2) done();
      });
      clientB.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "maxPlayers", optionValue: 3});
        if(++receieve === 2) done();
      });
    })

    it("change Setting (max player) should return error for client A, bad max player", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "maxPlayers",
        optionValue: 3
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isAMaxPlayers").mockReturnValue(false);
      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in an invalid settings configuration."});
        done();
      });
    })

    it("change Setting (timeLimit) should return success message for client A and B", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "timeLimit",
        optionValue: 3
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isAnAnswerTime").mockReturnValue(true);
      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      let receieve = 0
      clientA.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "timeLimit", optionValue: 3});
        if(++receieve === 2) done();
      });
      clientB.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "timeLimit", optionValue: 3});
        if(++receieve === 2) done();
      });
    })

    it("change Setting (timeLimit) should return error for client A, bad time", (done) => {
      /// Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "timeLimit",
        optionValue: 3
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isAnAnswerTime").mockReturnValue(false);
      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in an invalid settings configuration."});
        done();
      });
    })

    it("change Setting (totalQ) should return success message for client A and B", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "total",
        optionValue: 3
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isANumberOfQuestions").mockReturnValue(true);
      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      let receieve = 0
      clientA.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "total", optionValue: 3});
        if(++receieve === 2) done();
      });
      clientB.on("changedSetting", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({settingOption: "total", optionValue: 3});
        if(++receieve === 2) done();
      });
    })

    it("change Setting (totalQ) should return error for client A, bad total", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "total",
        optionValue: 3
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Mock checker so cat we send is always valid
      jest.spyOn(GameManager.prototype, "isANumberOfQuestions").mockReturnValue(false);
      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in an invalid settings configuration."});
        done();
      });
    })


    it("change Setting Invalid option return errror", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        settingOption: "booboo",
        optionValue: 3
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      clientA.emit("changeSetting", message);

      // make sure all players receive the message
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "You have passed in an invalid settings configuration."});
        done();
      });
    })

  })

  describe("readyToStartGame", () => {
    it("clientB sends readyToStartGame, everyone should receuve it", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        username: "username-B",
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      jest
        .spyOn(GameRoom.prototype, "getPlayers")
        .mockReturnValue([
          { user: { username: userA.username } },
          { user: { username: "username-B" } },
        ]);

      clientB.emit("readyToStartGame", message);

      // make sure all players receive the message
      let receieve = 0;
      clientA.on("playerReadyToStartGame", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({ playerUsername: "username-B" });
        if (++receieve === 2) done();
      });
      clientB.on("playerReadyToStartGame", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({ playerUsername: "username-B" });
        if (++receieve === 2) done();
      });
    });

    it("clientB sends readyToStartGame, everyone should receuve it", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        username: "username-B",
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(undefined);

      jest
        .spyOn(GameRoom.prototype, "getPlayers")
        .mockReturnValue([
          { user: { username: userA.username } },
          { user: { username: "username-B" } },
        ]);

      clientA.emit("readyToStartGame", message);

      // make sure all players receive the message
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({ message: "Invalid roomId" });
        done();
      });
    });
  });

  describe("startGame", () => {
    it("startGame should initialize the room and send first question to all players", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Make sure it passes successfuly from the question generator stage
      jest
        .spyOn(GameManager.prototype, "generateQuestions")
        .mockResolvedValue(0);
      const spy2 = jest
        .spyOn(GameManager.prototype, "updateRoomState")
        .mockImplementation();
      jest
        .spyOn(GameManager.prototype, "fetchNextQuestion")
        .mockReturnValue(
          new Question("What's 1+1?", "2", ["0", "11", "1"], "easy")
        );

      clientA.emit("startGame", message);

      // make sure all players receive the message
      let receieve = 0;
      clientA.on("startQuestion", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy2).toHaveBeenCalledTimes(1);

        expect(data.question).toEqual("What's 1+1?");
        expect(data.answers.slice().sort()).toEqual(
          ["0", "2", "11", "1"].slice().sort()
        );
        expect(data.answers[data.correctIndex]).toEqual("2");
        if (++receieve === 2) done();
      });
      clientB.on("startQuestion", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy2).toHaveBeenCalledTimes(1);

        expect(data.question).toEqual("What's 1+1?");
        expect(data.answers.slice().sort()).toEqual(
          ["0", "2", "11", "1"].slice().sort()
        );
        expect(data.answers[data.correctIndex]).toEqual("2");
        if (++receieve === 2) done();
      });
    });

    it("startGame invalid roomId; error to player", (done) => {
      // Message
      const message = {
        roomId: "badRoom",
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(undefined);

      // Make sure it passes successfuly from the question generator stage
      jest
        .spyOn(GameManager.prototype, "generateQuestions")
        .mockRejectedValue(1);

      clientA.emit("startGame", message);

      // make sure all players receive the message
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({ message: "Invalid RoomId" });
        done();
      });
    });

    it("startGame room had no categories selected; error to player", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Make sure it passes successfuly from the question generator stage
      jest
        .spyOn(GameManager.prototype, "generateQuestions")
        .mockRejectedValue(2);

      clientA.emit("startGame", message);

      // make sure all players receive the message
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({ message: "No Categories Selected" });
        done();
      });
    });

    it("startGame room had no categories selected; error to player", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
      };

      // Mock the room
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById");
      spy.mockReturnValue(roomA);

      // Make sure it passes successfuly from the question generator stage
      jest
        .spyOn(GameManager.prototype, "generateQuestions")
        .mockRejectedValue(2);

      clientA.emit("startGame", message);

      // make sure all players receive the message
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({ message: "No Categories Selected" });
        done();
      });
    });
  });

  describe("submitAnswer", () => {
    


    it("clientA sends answer, everyone else should receuve it", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        username: userA.username,
        answer: "answer-A",
      };

      clientA.emit("submitAnswer", message);

      // make sure all players receive the message
      clientB.on("answerReceived", (data) => {
        expect(data).toEqual({playerUsername: userA.username});
        done();
      });
    }); 
    
    it("clientA and clientB send answers, good submissins, next question gets sent", (done) => {
      // Message
      const messageA = {
        roomId: roomA.roomId,
        username : userA.username,
        timeDelay : 1000,
        isCorrect : true,
        powerupCode : -1,
        powerupVictimUsername: ""
      };

      const messageB = {
        roomId: roomA.roomId,
        username : userB.username,
        timeDelay : 1000,
        isCorrect : false,
        powerupCode : -1,
        powerupVictimUsername: ""
      };

      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById").mockReturnValue(roomA);

      let messagesAdded = 0;
      const spy2 = jest.spyOn(GameManager.prototype, "addResponseToRoom").mockImplementation(() => {return (++messagesAdded === 2)});

      let scores = new Map();
      scores.set(userA.username, 95);
      scores.set(userB.username, 0);
      const spy3 = jest.spyOn(GameManager.prototype, "calculateScore").mockImplementation(() => {return {returnCode: 0, scores}});
      const spy4 = jest.spyOn(GameManager.prototype, "addToPlayerScore").mockReturnValue([{username: userA.username, finalScore: 95},{username: userB.username, finalScore: 90}]) 
      
      const spy5 = jest.spyOn(GameManager.prototype, "fetchQuestionsQuantity").mockReturnValue(3);
      const spy6 = jest.spyOn(GameManager.prototype, "fetchNextQuestion").mockReturnValue(new Question("What's 2+2?", "4", ["0", "11", "1"], "easy"));

      clientA.emit("submitAnswer", messageA);
      clientB.emit("submitAnswer", messageB);

      // make sure all players receive the message
      let receieve = 0;
      clientA.on("showScoreboard", (data) => {
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy2).toHaveBeenCalledTimes(2);
        expect(spy3).toHaveBeenCalledTimes(1);
        expect(spy4).toHaveBeenCalledTimes(1);
        expect(data).toEqual({scores: [{username: userA.username, pointsEarned: 95, updatedTotalPoints: 95},{username: userB.username, pointsEarned: 0, updatedTotalPoints: 90}]});
        receieve++;
      });
      clientB.on("showScoreboard", (data) => {
        expect(data).toEqual({scores: [{username: userA.username, pointsEarned: 95, updatedTotalPoints: 95},{username: userB.username, pointsEarned: 0, updatedTotalPoints: 90}]});
        receieve++;        
      });
      clientA.on("startQuestion", (data) => {
        expect(spy5).toHaveBeenCalledTimes(1);
        expect(spy6).toHaveBeenCalledTimes(1);
        expect(data.question).toEqual("What's 2+2?");
        expect(data.answers.slice().sort()).toEqual(["0", "4", "11", "1"].slice().sort());
        expect(data.answers[data.correctIndex]).toEqual("4");
        if(++receieve == 4) done();
      });
      clientB.on("startQuestion", (data) => {
        expect(spy5).toHaveBeenCalledTimes(1);
        expect(spy6).toHaveBeenCalledTimes(1);
        expect(data.question).toEqual("What's 2+2?");
        expect(data.answers.slice().sort()).toEqual(["0", "4", "11", "1"].slice().sort());
        expect(data.answers[data.correctIndex]).toEqual("4");
        if(++receieve == 4) done();
      });

      
    }, 8000); 

    const sucesfullSubmissionEndGame = (numberOfPlayers, done) => {
      // Messages to submit Answers
      const messageA = {
        roomId: roomA.roomId,
        username : userA.username,
        timeDelay : 1000,
        isCorrect : true,
        powerupCode : -1,
        powerupVictimUsername: ""
      };

      const messageB = {
        roomId: roomA.roomId,
        username : userB.username,
        timeDelay : 1000,
        isCorrect : false,
        powerupCode : -1,
        powerupVictimUsername: ""
      };

      // Fetch Room Changes
      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById").mockReturnValue(roomA);

      // Mock responses to room
      let messagesAdded = 0;
      const spy2 = jest.spyOn(GameManager.prototype, "addResponseToRoom").mockImplementation(() => {return (++messagesAdded === 2)});

      // Mock return of new scores
      let scores = new Map();
      scores.set(userA.username, 95);
      scores.set(userB.username, 0);
      const spy3 = jest.spyOn(GameManager.prototype, "calculateScore").mockImplementation(() => {return {returnCode: 0, scores}});
      const spy4 = jest.spyOn(GameManager.prototype, "addToPlayerScore").mockReturnValue([{username: userA.username, finalScore: 95},{username: userB.username, finalScore: 90}]) 
      
      // mock quantity checker
      jest.spyOn(GameManager.prototype, "fetchQuestionsQuantity").mockReturnValue(0);

      // Mock DB
      jest.spyOn(UserDBManager.prototype, "updateUserRank");

      let playerArray = Array(numberOfPlayers).fill(gameMasterA);
      jest.spyOn(GameRoom.prototype, "getPlayers").mockReturnValue(playerArray)
      jest.spyOn(Player.prototype, "getSocketId").mockReturnValue("7")
      
      clientA.emit("submitAnswer", messageA);
      clientB.emit("submitAnswer", messageB);

      // make sure all players receive the message
      let receieve = 0;
      clientA.on("showScoreboard", (data) => {
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy2).toHaveBeenCalledTimes(2);
        expect(spy3).toHaveBeenCalledTimes(1);
        expect(spy4).toHaveBeenCalledTimes(1);
        expect(data).toEqual({scores: [{username: userA.username, pointsEarned: 95, updatedTotalPoints: 95},{username: userB.username, pointsEarned: 0, updatedTotalPoints: 90}]});
        receieve++;
      });
      clientB.on("showScoreboard", (data) => {
        expect(data).toEqual({scores: [{username: userA.username, pointsEarned: 95, updatedTotalPoints: 95},{username: userB.username, pointsEarned: 0, updatedTotalPoints: 90}]});
        receieve++;        
      });
      clientA.on("endGame", (data) => {
        expect(data).toEqual({scores:[{username: userA.username, finalScore: 95},{username: userB.username, finalScore: 90}]});
        if(++receieve == 4) done();
      });
      clientB.on("endGame", (data) => {
        expect(data).toEqual({scores:[{username: userA.username, finalScore: 95},{username: userB.username, finalScore: 90}]});
        if(++receieve == 4) done();
      });
    }

    it("clientA and clientB send answers, good submissins, last question so endGame (1 people in room)", (done) => {
      const numberOfPlayers = 1;
      sucesfullSubmissionEndGame(numberOfPlayers, done);
    }, 8000);
    it("clientA and clientB send answers, good submissins, last question so endGame (2 people in room)", (done) => {
      const numberOfPlayers = 2;
      sucesfullSubmissionEndGame(numberOfPlayers, done);
    }, 8000);
    it("clientA and clientB send answers, good submissins, last question so endGame (3 people in room)", (done) => {
      const numberOfPlayers = 3;
      sucesfullSubmissionEndGame(numberOfPlayers, done);
    }, 8000);
    it("clientA and clientB send answers, good submissins, last question so endGame (4 people in room)", (done) => {
      const numberOfPlayers = 4;
      sucesfullSubmissionEndGame(numberOfPlayers, done);
    }, 8000);
    it("clientA and clientB send answers, good submissins, last question so endGame (5 people in room)", (done) => {
      const numberOfPlayers = 5;
      sucesfullSubmissionEndGame(numberOfPlayers, done);
    }, 8000);
    it("clientA and clientB send answers, good submissins, last question so endGame (6 people in room)", (done) => {
      const numberOfPlayers = 6;
      sucesfullSubmissionEndGame(numberOfPlayers, done);
    }, 8000);
    

    it("clientA and clientB send answers, error in calucalting answers, errors out", (done) => {
      // Message
      const messageA = {
        roomId: roomA.roomId,
        username : userA.username,
        timeDelay : 1000,
        isCorrect : true,
        powerupCode : -1,
        powerupVictimUsername: ""
      };

      const messageB = {
        roomId: roomA.roomId,
        username : userB.username,
        timeDelay : 1000,
        isCorrect : false,
        powerupCode : -1,
        powerupVictimUsername: ""
      };

      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById").mockReturnValue(roomA);
      let messagesAdded = 0;
      const spy2 = jest.spyOn(GameManager.prototype, "addResponseToRoom").mockImplementation(() => {return (++messagesAdded === 2)});
      const spy3 = calculateScoreSpy = jest.spyOn(GameManager.prototype, "calculateScore").mockImplementation(() => {return {returnCode: 1}});


      clientA.emit("submitAnswer", messageA);
      clientB.emit("submitAnswer", messageB);

      // make sure all players receive the message
      let receieve = 0;
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy2).toHaveBeenCalledTimes(2);
        expect(spy3).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "Error in calculating scores"});
        if (++receieve == 2) done();
      });
      clientB.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy2).toHaveBeenCalledTimes(2);
        expect(spy3).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "Error in calculating scores"});
        if (++receieve == 2) done();
      });
    }); 

    it("clientA sends bad message, errors out", (done) => {
      // Message
      const messageA = {
        roomId: "WEEEE",
        username : userA.username,
        timeDelay : 1000,
        isCorrect : true,
        powerupCode : -1,
        powerupVictimUsername: ""
      };

      const spy = jest.spyOn(GameManager.prototype, "fetchRoomById").mockReturnValue(undefined);

      clientA.emit("submitAnswer", messageA);

      // make sure all players receive the message
      clientA.on("error", (data) => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(data).toEqual({message: "Bad Answer Submission"});
        done();
      });
    }); 
  })

  describe("submitEmote", () => {
    it("clientA sends emote, everyone else should receuve it", (done) => {
      // Message
      const message = {
        roomId: roomA.roomId,
        username: userA.username,
        emoteCode: "emote-A",
      };

      clientA.emit("submitEmote", message);

      // make sure all players receive the message
      clientB.on("emoteReceived", (data) => {
        expect(data).toEqual({
          username: userA.username,
          emoteCode: "emote-A",
        });
        done();
      });
    });
  });
});
