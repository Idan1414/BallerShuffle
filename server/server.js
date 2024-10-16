const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql');

const app = express(); //initiate the express app

app.use(express.json()); // in order to parse JSON in the req.body for example.

const cors = require('cors');
app.use(cors()); // Cross-Origin Resource Sharing, in order to access from different domains.

require('dotenv').config();// allowing calling vars from .env
const jwtSecret = process.env.JWT_SECRET;


const delay = ms => new Promise(resolve => setTimeout(resolve, ms));


//Wrapper for the db.query
const promiseQuery = (sql, params) => {
  //returns Promise object with arguments Resolve or reject
  return new Promise((resolve, reject) => {
    //callBack func to get fill in the arguments Resolve or Reject
    //results = array of the rows from the query . fields = array of the column heads name and type
    db.query(sql, params, (err, results, fields) => {
      if (err) {
        reject(err);
      } else {
        resolve({ results, fields });
      }
    });
  });
}

//-----------------------------------------------------------------------------------------------

//-----------------------------------------------------------------------------------------------

// Registration endpoint
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if the username already exists in the database
    const { results } = await promiseQuery('SELECT * FROM users WHERE username = ?', [username]);

    // If the username already exists, send a 409 Conflict response
    if (results.length > 0) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    // If the username does not exist, hash the password and save the user in the database
    const hashedPassword = await bcrypt.hash(password, 10); //10 rounds of hashing
    await promiseQuery('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, username, hashedPassword]);

    res.status(201).send('User registered');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error registering user');
  }
});

//-----------------------------------------------------------------------------------------------


// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    // Check if the username exists in the database
    const { results } = await promiseQuery('SELECT * FROM users WHERE username = ?', [username]);
    if (results.length === 0) {
      return res.status(404).send('User not found');
    }

    // Takes the first row (only row)
    const user = results[0];

    // Checks password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (passwordMatch) {
      console.log(user);

      // Fetch courts associated with the user
      const { results: courtResults } = await promiseQuery('SELECT courtId FROM user_user_courts WHERE userId = ?', [user.id]);
      const courts = courtResults.map(court => court.courtId); // Assuming court_id is the column name

      // Create the token payload with userId and courts
      const tokenPayload = {
        userId: user.id,
        courts: courts, // Array of court IDs the user has access to
        // Other user info can be added here if needed
      };

      // Generates the token
      const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '24h' });

      res.status(200).json({ userId: user.id, message: 'Logged in', token });
    } else {
      res.status(401).send('Password incorrect');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error logging in');
  }
});


//-----------------------------------------------------------------------------------------------

//Token generation
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

//-----------------------------------------------------------------------------------------------
// Update token endpoint
app.post('/api/update-token', async (req, res) => {
  const { token } = req.body; // The current token

  try {
    // Verify the token
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;

    // Fetch updated courts associated with the user
    const { results: courtResults } = await promiseQuery('SELECT courtId FROM user_user_courts WHERE userId = ?', [userId]);
    const updatedCourts = courtResults.map(court => court.courtId);

    // Create a new token payload with the updated courts
    const newTokenPayload = {
      userId: decoded.userId,
      courts: updatedCourts, // Updated courts
    };

    // Sign a new token with the updated data
    const newToken = jwt.sign(newTokenPayload, jwtSecret, { expiresIn: '24h' });

    res.status(200).json({ token: newToken });
  } catch (error) {
    console.error('Error updating token', error);
    res.status(500).send('Failed to update token');
  }
});


//-----------------------------------------------------------------------------------------------

// Courts endpoint
app.get('/api/courts/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    const { results } = await promiseQuery(
      `SELECT c.id, c.courtName, c.courtType
      FROM courts AS c
      JOIN user_user_courts AS uc ON c.id = uc.courtId
      WHERE uc.userId = ?`,
      [userId]
    );
    if (results.length === 0) {
      return res.status(404).json({ message: 'No courts found' });
    }
    const courts = results.map(c => ({
      id: c.id,
      courtName: c.courtName,
      courtType: c.courtType
    }));
    res.json(courts);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching courts');
  }
});


//-----------------------------------------------------------------------------------------------

// One Court endpoint
app.get('/api/court_info/:court_id', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;
    const { results } = await promiseQuery(
      `SELECT c.courtName, c.courtType
      FROM courts AS c
      WHERE c.id = ?`,
      [courtId]
    );
    if (results.length === 0) {
      return res.status(404).json({ message: 'No courts found' });
    }
    const court = results.map(c => ({
      courtName: c.courtName,
      courtType: c.courtType
    }));
    res.json(court);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching courts');
  }
});






//-----------------------------------------------------------------------------------------------



//FOOTBALL_Players endpoint
app.get('/api/football_players/:court_id', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;
    const { results } = await promiseQuery(
      `SELECT p.*, fpa.* FROM ballershuffleschema.players as p
       LEFT JOIN football_player_attributes as fpa on p.id = fpa.playerId
       WHERE courtId = ?`,
      [courtId]
    );
    if (results.length === 0) {
      return res.status(404).json({ message: 'No players found' });
    }
    const players = results.map(p => ({
      playerId: p.playerId,
      name: p.name,
      finishing: p.finishing,
      passing: p.passing,
      speed: p.speed,
      physical: p.physical,
      defence: p.defence,
      dribbling: p.dribbling,
      header: p.header,
      overall: p.overall,
      overallToMix: p.overallToMix,
      user_fk: p.user_fk,
      creator_user_fk: p.creator_user_fk
    }));
    res.json(players); //sending it as a JSON file to the client
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching players');
  }
});

//-----------------------------------------------------------------------------------------------


// Basketball_Players endpoint
app.get('/api/players/:court_id', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;
    const { results } = await promiseQuery(
      `SELECT p.*, bpa.* FROM ballershuffleschema.players as p
       LEFT JOIN basketball_player_attributes as bpa on p.id = bpa.playerId
       WHERE courtId = ?`,
      [courtId]
    );
    if (results.length === 0) {
      return res.status(404).json({ message: 'No players found' });
    }
    const players = results.map(p => ({
      playerId: p.playerId,
      name: p.name,
      scoring: p.scoring,
      passing: p.passing,
      speed: p.speed,
      physical: p.physical,
      defence: p.defence,
      threePtShot: p.threePtShot,
      rebound: p.rebound,
      ballHandling: p.ballHandling,
      postUp: p.postUp,
      height: p.height,
      overall: p.overall,
      overallToMix: p.overallToMix,
      user_fk: p.user_fk,
      creator_user_fk: p.creator_user_fk
    }));
    res.json(players); //sending it as a JSON file to the client
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching players');
  }
});

//-----------------------------------------------------------------------------------------------


// BASKETBALL - Averages endpoint
app.get('/api/court/:court_id/averages', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;

    const { results } = await promiseQuery(
      `
    SELECT 
    AVG(bpa.scoring) AS avgScoring,
    MAX(bpa.scoring) AS maxScoring,
    MIN(bpa.scoring) AS minScoring,
    AVG(bpa.passing) AS avgPassing,
    MAX(bpa.passing) AS maxPassing,
    MIN(bpa.passing) AS minPassing,
    AVG(bpa.speed) AS avgSpeed,
    MAX(bpa.speed) AS maxSpeed,
    MIN(bpa.speed) AS minSpeed,
    AVG(bpa.physical) AS avgPhysical,
    MAX(bpa.physical) AS maxPhysical,
    MIN(bpa.physical) AS minPhysical,
    AVG(bpa.defence) AS avgDefence,
    MAX(bpa.defence) AS maxDefence,
    MIN(bpa.defence) AS minDefence,
    AVG(bpa.threePtShot) AS avgThreePtShot,
    MAX(bpa.threePtShot) AS maxThreePtShot,
    MIN(bpa.threePtShot) AS minThreePtShot,
    AVG(bpa.rebound) AS avgRebound,
    MAX(bpa.rebound) AS maxRebound,
    MIN(bpa.rebound) AS minRebound,
    AVG(bpa.ballHandling) AS avgBallHandling,
    MAX(bpa.ballHandling) AS maxBallHandling,
    MIN(bpa.ballHandling) AS minBallHandling,
    AVG(bpa.postUp) AS avgPostUp,
    MAX(bpa.postUp) AS maxPostUp,
    MIN(bpa.postUp) AS minPostUp,
    AVG(bpa.overall) AS avgOverall,
    MAX(bpa.overall) AS maxOverall,
    MIN(bpa.overall) AS minOverall
    FROM 
        ballershuffleschema.players p
    LEFT JOIN 
        ballershuffleschema.basketball_player_attributes bpa ON p.id = bpa.playerId
    WHERE 
    p.courtId = ?;

      `,
      [courtId]
    );

    if (results.length === 0 || results[0].avgScoring === null) {
      return res.status(404).json({ message: 'No players found for this court' });
    }

    const averages = results[0];
    res.json(averages);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching averages');
  }
});

//-----------------------------------------------------------------------------------------------
// FOOTBALL - Averages endpoint
app.get('/api/football-court/:court_id/averages', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;

    const { results } = await promiseQuery(
      `
    SELECT 
    AVG(fpa.finishing) AS avgFinishing,
    MAX(fpa.finishing) AS maxFinishing,
    MIN(fpa.finishing) AS minFinishing,
    AVG(fpa.passing) AS avgPassing,
    MAX(fpa.passing) AS maxPassing,
    MIN(fpa.passing) AS minPassing,
    AVG(fpa.speed) AS avgSpeed,
    MAX(fpa.speed) AS maxSpeed,
    MIN(fpa.speed) AS minSpeed,
    AVG(fpa.physical) AS avgPhysical,
    MAX(fpa.physical) AS maxPhysical,
    MIN(fpa.physical) AS minPhysical,
    AVG(fpa.defence) AS avgDefence,
    MAX(fpa.defence) AS maxDefence,
    MIN(fpa.defence) AS minDefence,
    AVG(fpa.dribbling) AS avgDribbling,
    MAX(fpa.dribbling) AS maxDribbling,
    MIN(fpa.dribbling) AS minDribbling,
    AVG(fpa.header) AS avgHeader,
    MAX(fpa.header) AS maxHeader,
    MIN(fpa.header) AS minHeader,
    AVG(fpa.overall) AS avgOverall,
    MAX(fpa.overall) AS maxOverall,
    MIN(fpa.overall) AS minOverall
    FROM 
        ballershuffleschema.players p
    LEFT JOIN 
        ballershuffleschema.football_player_attributes fpa ON p.id = fpa.playerId
    WHERE 
    p.courtId = ?;

      `,
      [courtId]
    );

    if (results.length === 0 || results[0].avgFinishing === null) {
      return res.status(404).json({ message: 'No players in this court, no averages to present yet.' });
    }

    const averages = results[0];
    res.json(averages);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching averages');
  }
});

//-----------------------------------------------------------------------------------------------
// Create Player Endpoint - BASKETBALL
app.post('/api/create_player/:court_id/:creator_user_fk', authenticateToken, async (req, res) => {
  const court_Id = req.params.court_id;
  const creator_user_fk = req.params.creator_user_fk;
  const { name, scoring, passing, speed, physical, defence, threePtShot, rebound, ballHandling, postUp, height, overall } = req.body;

  try {
    // First query: Insert into "players" table
    const insertPlayerResult = await promiseQuery(
      'INSERT INTO ballershuffleschema.players (name, courtId, type, user_fk, creator_user_fk) VALUES (?, ?, ?, ?, ?)',
      [name, court_Id, 'Basketball', null, creator_user_fk]
    );

    await delay(50);



    // Fetch the last inserted player based on unique attributes (like name and courtId) in order to get the ID
    const { results } = await promiseQuery(
      'SELECT id FROM ballershuffleschema.players WHERE name = ? AND courtId = ? ORDER BY id DESC LIMIT 1',
      [name, court_Id]
    );

    if (results.length === 0) {
      return res.status(500).send('Error retrieving player ID');
    }

    const playerId = results[0].id;

    await delay(50);

    // Second query: Insert into "basketball_player_attributes" table
    await promiseQuery(
      'INSERT INTO ballershuffleschema.basketball_player_attributes (playerId, scoring, passing, speed, physical, defence, threePtShot, rebound, ballHandling, postUp, height, overall,overallToMix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [playerId, scoring, passing, speed, physical, defence, threePtShot, rebound, ballHandling, postUp, height, overall, 0]
    );

    res.status(201).send('Player created successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error creating player');
  }
});





//-----------------------------------------------------------------------------------------------
// Create Player Endpoint - FOOTBALL
app.post('/api/create_player_football/:court_id/:creator_user_fk', authenticateToken, async (req, res) => {
  const court_Id = req.params.court_id;
  const creator_user_fk = req.params.creator_user_fk;
  const { name, finishing, passing, speed, physical, defence, dribbling, header, overall } = req.body;

  try {
    // First query: Insert into "players" table
    const insertPlayerResult = await promiseQuery(
      'INSERT INTO ballershuffleschema.players (name, courtId, type, user_fk, creator_user_fk) VALUES (?, ?, ?, ?, ?)',
      [name, court_Id, 'Football', null, creator_user_fk]
    );

    await delay(50);



    // Fetch the last inserted player based on unique attributes (like name and courtId) in order to get the ID
    const { results } = await promiseQuery(
      'SELECT id FROM ballershuffleschema.players WHERE name = ? AND courtId = ? ORDER BY id DESC LIMIT 1',
      [name, court_Id]
    );

    if (results.length === 0) {
      return res.status(500).send('Error retrieving player ID');
    }

    const playerId = results[0].id;

    await delay(50);

    // Second query: Insert into "basketball_player_attributes" table
    await promiseQuery(
      'INSERT INTO ballershuffleschema.football_player_attributes (playerId, finishing, passing, speed, physical, defence, dribbling, header, overall, overallToMix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [playerId, finishing, passing, speed, physical, defence, dribbling, header, overall, 0]
    );

    res.status(201).send('Player created successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error creating player');
  }
});

//-----------------------------------------------------------------------------------------------


// Get one Football-Player endpoint
app.get('/api/football-player/:player_id/:court_id', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;
    const playerId = req.params.player_id;
    const { results } = await promiseQuery(
      `SELECT * FROM ballershuffleschema.players as p
       LEFT JOIN football_player_attributes as fpa on p.id = fpa.playerId
       WHERE courtId = ? AND playerId = ?`,
      [courtId, playerId]
    );
    if (results.length === 0) {
      return res.status(404).json({ message: 'couldnt find the player' });
    }
    const p = results[0]; // Assuming `results` has at least one entry

    const player = {
      playerId: p.playerId,
      name: p.name,
      finishing: p.finishing,
      passing: p.passing,
      speed: p.speed,
      physical: p.physical,
      defence: p.defence,
      dribbling: p.dribbling,
      header: p.header,
      overall: p.overall,
      overallToMix: p.overallToMix,
    };
    res.json(player); //sending it as a JSON file to the client
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching player');
  }
});


//-----------------------------------------------------------------------------------------------


// Get one Basketball-Player endpoint
app.get('/api/player/:player_id/:court_id', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;
    const playerId = req.params.player_id;
    const { results } = await promiseQuery(
      `SELECT * FROM ballershuffleschema.players as p
       LEFT JOIN basketball_player_attributes as bpa on p.id = bpa.playerId
       WHERE courtId = ? AND playerId = ?`,
      [courtId, playerId]
    );
    if (results.length === 0) {
      return res.status(404).json({ message: 'couldnt find the player' });
    }
    const p = results[0]; // Assuming `results` has at least one entry

    const player = {
      playerId: p.playerId,
      name: p.name,
      scoring: p.scoring,
      passing: p.passing,
      speed: p.speed,
      physical: p.physical,
      defence: p.defence,
      threePtShot: p.threePtShot,
      rebound: p.rebound,
      ballHandling: p.ballHandling,
      postUp: p.postUp,
      height: p.height,
      overall: p.overall,
      overallToMix: p.overallToMix,
    };
    res.json(player); //sending it as a JSON file to the client
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching player');
  }
});




//-----------------------------------------------------------------------------------------------

// Check if User_fk exists for a Player endpoint
app.get('/api/is_player_assinged/:player_id', authenticateToken, async (req, res) => {
  try {
    const playerId = req.params.player_id;

    const { results } = await promiseQuery(
      `SELECT user_fk FROM ballershuffleschema.players WHERE id = ?`,
      [playerId]
    );

    if (results.length === 0) {
      return res.status(404).json({ message: 'Player not found' });
    }

    const userFkExists = results[0].user_fk !== null; // Check if user_fk is not -1 or null
    res.json({ userFkExists }); // Sending the result as a JSON file to the client
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching user_fk for player');
  }
});


//-----------------------------------------------------------------------------------------------

// Update Player endpoint
app.put('/api/update_player/:player_id/:court_id', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;
    const playerId = req.params.player_id;
    const {
      name,
      scoring,
      passing,
      speed,
      physical,
      defence,
      threePtShot,
      rebound,
      ballHandling,
      postUp,
      height,
      overall,
      overallToMix
    } = req.body;

    const updateName = `UPDATE ballershuffleschema.players SET name = ? WHERE id = ?`

      ;
    await promiseQuery(updateName, [name, playerId]);

    await delay(50);


    const updateQuery = ` UPDATE ballershuffleschema.basketball_player_attributes
      SET scoring = ?, passing = ?, speed = ?, physical = ?, defence = ?, 
          threePtShot = ?, rebound = ?, ballHandling = ?, postUp = ?, height = ?, 
          overall = ?, overallToMix = ?
      WHERE playerId = ?`;



    await promiseQuery(updateQuery,
      [scoring, passing, speed, physical, defence, threePtShot, rebound,
        ballHandling, postUp, height, overall, overallToMix, playerId]);

    res.json({ message: 'Player updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error updating player');
  }
});


//-----------------------------------------------------------------------------------------------


// Update Football-Player endpoint
app.put('/api/update-player-football/:player_id/:court_id', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;
    const playerId = req.params.player_id;
    const {
      name,
      finishing,
      passing,
      speed,
      physical,
      defence,
      dribbling,
      header,
      overall,
      overallToMix
    } = req.body;

    const updateName = `UPDATE ballershuffleschema.players SET name = ? WHERE id = ?`;
    await promiseQuery(updateName, [name, playerId]);

    await delay(50);


    const updateQuery = ` UPDATE ballershuffleschema.football_player_attributes
      SET finishing = ?, passing = ?, speed = ?, physical = ?, defence = ?, 
          dribbling = ?, header = ?, overall = ?, overallToMix = ?
      WHERE playerId = ?`;



    await promiseQuery(updateQuery,
      [finishing, passing, speed, physical, defence, dribbling, header,
        overall, overallToMix, playerId]);

    res.json({ message: 'Player updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error updating player');
  }
});


//-----------------------------------------------------------------------------------------------

// Assign Player endpoint
app.put('/api/assign_player/:player_id/:email/:court_id', authenticateToken, async (req, res) => {
  try {
    const playerId = req.params.player_id;
    const email = req.params.email;
    const courtId = req.params.court_id;

    console.log("entered API/ assign_player with email: " + email)


    // Check if the email exists
    const { results } = await promiseQuery(
      `SELECT id FROM ballershuffleschema.users WHERE email = ?`,
      [email]
    );



    // If no user found with that email
    if (!results || results.length === 0) {
      return res.status(404).json({ message: 'Email does not exist' });
    }



    const user_fk_to_assign = results[0].id;
    console.log(email, user_fk_to_assign, playerId);

    //Make sure only one player in a court will be assinged to 1 user
    const { results: playerCheckResults } = await promiseQuery(
      `SELECT * FROM ballershuffleschema.players 
       WHERE user_fk = ? AND courtId = ?`,
      [user_fk_to_assign, courtId]
    );

    // If the user is already assigned to the player in the court
    if (playerCheckResults && playerCheckResults.length > 0) {
      return res.status(400).json({ message: 'User is already assigned to a player in the specified court' });
    }

    const assignUserFkToPlayer = `UPDATE ballershuffleschema.players SET user_fk = ? WHERE id = ?`;

    // Update the player with the found user ID
    await promiseQuery(assignUserFkToPlayer, [user_fk_to_assign, playerId]);

    // Insert into user_user_courts only if the court doesn't already exist to the user

    await promiseQuery(
      `INSERT INTO ballershuffleschema.user_user_courts (userId, courtId)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM ballershuffleschema.user_user_courts WHERE userId = ? AND courtId = ?
       )`,
      [user_fk_to_assign, courtId, user_fk_to_assign, courtId]
    );

    // Successful assignment
    res.json({ message: 'Player assigned successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error assigning player');
  }
});








//-----------------------------------------------------------------------------------------------



// Delete Player endpoint
app.delete('/api/delete_player/:player_id/:court_id', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;
    const playerId = req.params.player_id;


    const { results: user_fk_of_player } = await promiseQuery(
      `SELECT user_fk FROM ballershuffleschema.players 
       WHERE id = ? AND courtId = ?`,
      [playerId, courtId]
    );

    console.log("user fk of the player :", user_fk_of_player)

    //Delete from registration games table:
    await promiseQuery(
      'DELETE FROM ballershuffleschema.registrations_to_game WHERE player_id = ?',
      [playerId]
    );

    // Delete from basketball_player_attributes table
    await promiseQuery(
      'DELETE FROM ballershuffleschema.basketball_player_attributes WHERE playerId = ?',
      [playerId]
    );

    await delay(50);



    // Delete from players table
    await promiseQuery(
      'DELETE FROM ballershuffleschema.players WHERE id = ? AND courtId = ?',
      [playerId, courtId]
    );


    if (user_fk_of_player) {
      //Make sure to delete the court only if the player was assigned to a user
      await promiseQuery(
        `DELETE FROM ballershuffleschema.user_user_courts WHERE userId = ? AND courtId = ?`,
        [user_fk_of_player[0].user_fk, courtId]
      );

    }

    res.status(200).json({ message: 'Player deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error deleting player');
  }
});

//-----------------------------------------------------------------------------------------------



// Create Court Endpoint
app.post('/api/create_court/:user_id', authenticateToken, async (req, res) => {
  const userId = req.params.user_id;
  const { courtName, courtType } = req.body;
  try {
    // First query: Insert into "courts" table
    await promiseQuery(
      'INSERT INTO ballershuffleschema.courts (created_at, courtName, courtType) VALUES (NOW(), ?, ?)',
      [courtName, courtType]
    );

    await delay(50);


    // Fetch the last inserted court based on unique attributes (like courtName and userId) to get the ID
    const { results } = await promiseQuery(
      'SELECT id FROM ballershuffleschema.courts WHERE courtName = ? ORDER BY id DESC LIMIT 1',
      [courtName]
    );

    if (results.length === 0) {
      return res.status(500).send('Error retrieving court ID');
    }


    const courtId = results[0].id;

    await delay(50);

    //Add admin
    await promiseQuery(
      'INSERT INTO ballershuffleschema.court_admins (user_id, court_id, is_admin) VALUES (?, ?, ?)',
      [userId, courtId, 1]
    );
    await delay(50);


    //Add to user_user_courts
    await promiseQuery(
      'INSERT INTO ballershuffleschema.user_user_courts (userId, courtId) VALUES (?, ?)',
      [userId, courtId]
    );

    res.status(201).json({
      message: 'Court created successfully',
      courtId,
      courtName,
      courtType
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error creating court');
  }
});


//-----------------------------------------------------------------------------------------------
// Update Court Name Endpoint
app.put('/api/update_court_name/:courtId', authenticateToken, async (req, res) => {
  const courtId = req.params.courtId;
  const { courtName: newCourtName } = req.body; // Corrected line

  // Validate input
  if (!newCourtName) {
    return res.status(400).send('New court name is required');
  }

  try {
    // Update the court name in the "courts" table
    const result = await promiseQuery(
      'UPDATE ballershuffleschema.courts SET courtName = ? WHERE id = ?',
      [newCourtName, courtId]
    );

    // Check if the court was updated successfully
    if (result.affectedRows === 0) {
      return res.status(404).send('Court not found');
    }

    res.status(200).json({
      message: 'Court name updated successfully',
      courtId,
      newCourtName,
    });
  } catch (error) {
    console.error('Error updating court name:', error);
    res.status(500).send('Error updating court name');
  }
});



//-----------------------------------------------------------------------------------------------

//isAdmin endpoint:
app.get('/api/is_admin/:user_id/:court_id', (req, res) => {
  const courtId = req.params.court_id;
  const userId = req.params.user_id;
  const query = 'SELECT is_admin FROM ballershuffleschema.court_admins WHERE user_id = ? AND court_id = ?';
  db.query(query, [userId, courtId], (error, results) => {
    if (error) return res.status(500).send(error);
    if (results.length > 0 && results[0].is_admin === 1) {
      res.json({ isAdmin: true });
    } else {
      res.json({ isAdmin: false });
    }
  });
});


//-----------------------------------------------------------------------------------------------


// Delete Court endpoint
app.delete('/api/delete_court/:user_id/:court_id', authenticateToken, async (req, res) => {
  try {
    const courtId = req.params.court_id;
    const userId = req.params.user_id;

    // Delete from basketball_player_attributes table
    await promiseQuery(
      'DELETE FROM ballershuffleschema.user_user_courts WHERE userId = ? AND courtId = ?',
      [userId, courtId]
    );

    // UnAssign the player from the user
    await promiseQuery(
      ` UPDATE ballershuffleschema.players SET user_fk = NULL WHERE user_fk = ? AND courtId = ?`,
      [userId, courtId]
    );

    res.status(200).json({ message: 'Court deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error deleting court');
  }
});



//-----------------------------------------------------------------------------------------------


const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'ballershuffleschema'
});

db.connect(err => {
  if (err) {
    throw err;
  }
  console.log('Connected to the database');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

//-----------------------------------------------------------------------------------------------

// Scheduled Games endpoint
app.get('/api/scheduled_games/:court_id', authenticateToken, async (req, res) => {
  const courtId = req.params.court_id;

  try {
    // Query to fetch scheduled games from the database with MVP name
    const { results } = await promiseQuery(
      `SELECT g.*, p.name AS mvp_name
       FROM games AS g 
       LEFT JOIN players AS p ON g.mvp = p.id
       WHERE g.court_id = ? 
       ORDER BY g.game_start_time DESC`, // Order by date, latest first
      [courtId]
    );


    // Check if any games were found
    if (results.length === 0) {
      return res.status(404).json({ message: 'No scheduled games found for the specified court ID.' });
    }

    // Mapping results to a structured format
    const games = results.map(g => ({
      game_id: g.game_id,
      game_court_id: g.court_id,
      start_date: g.game_start_time,
      start_regis: g.registration_open_time,
      close_regis: g.registration_close_time,
      max_players: g.max_players,
      num_of_teams: g.num_of_teams,
      created_by: g.created_by,
      location: g.location,
      description: g.description,
      mvp: {
        id: g.mvp,
        name: g.mvp_name // Getting the MVP's name from the join
      },
      max_players_each_user_can_add: g.max_players_each_user_can_add
    }));

    // Sending the games data as a JSON response
    res.json(games);
  } catch (error) {
    // Logging the error for debugging purposes
    console.error('Error fetching scheduled games:', error);

    // Responding with a 500 status code in case of server error
    res.status(500).json({ message: 'An error occurred while fetching scheduled games.' });
  }
});



//-----------------------------------------------------------------------------------------------

// Create game API
app.post('/api/create_game', authenticateToken, (req, res) => {
  const {
    court_id,
    game_start_time,
    registration_open_time,
    registration_close_time,
    max_players,
    num_of_teams,
    created_by,
    location,
    description,
    max_players_each_user_can_add,
  } = req.body;

  // Insert query for adding a new game
  const sql = `
    INSERT INTO games (
      court_id, game_start_time, registration_open_time, registration_close_time,
      max_players, num_of_teams, created_by, location, description , max_players_each_user_can_add
    ) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ? , ?)`;

  const params = [
    court_id,
    game_start_time,
    registration_open_time,
    registration_close_time,
    max_players,
    num_of_teams,
    created_by,
    location,
    description,
    max_players_each_user_can_add
  ];

  promiseQuery(sql, params)
    .then(({ results }) => {
      res.status(201).json({ gameId: results.insertId, message: 'Game created successfully' });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).send('Error creating game');
    });
});



// Update game API ----------------------------------------------------------------
app.put('/api/update_game/:gameId', authenticateToken, (req, res) => {
  const gameId = req.params.gameId;
  const {
    game_court_id,
    game_start_time,
    registration_open_time,
    registration_close_time,
    max_players,
    num_of_teams,
    location,
    description,
    max_players_each_user_can_add,
  } = req.body;
  console.log(req.body)

  // Update query for modifying an existing game
  const sql = `
    UPDATE games SET 
      court_id = ?, 
      game_start_time = ?, 
      registration_open_time = ?, 
      registration_close_time = ?, 
      max_players = ?, 
      num_of_teams = ?, 
      location = ?, 
      description = ?, 
      max_players_each_user_can_add = ?
    WHERE game_id = ?`;

  const params = [
    game_court_id,
    game_start_time,
    registration_open_time,
    registration_close_time,
    max_players,
    num_of_teams,
    location,
    description,
    max_players_each_user_can_add,
    gameId,
  ];

  promiseQuery(sql, params)
    .then(() => {
      res.status(200).json({ message: 'Game updated successfully' });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).send('Error updating game');
    });
});


/* FETCH GAME API ----------------------------------------------*/
app.get('/api/game/:game_id', authenticateToken, async (req, res) => {
  const gameId = req.params.game_id;

  try {
    // Query to fetch game details from the database
    const { results } = await promiseQuery(
      `SELECT g.*, p.name AS mvp_name, u.username AS creator_username
       FROM games AS g 
       LEFT JOIN players AS p ON g.mvp = p.id
       LEFT JOIN users AS u ON g.created_by = u.id
       WHERE g.game_id = ?`,
      [gameId]
    );

    // Check if any game was found
    if (results.length === 0) {
      return res.status(404).json({ message: 'Game not found.' });
    }

    const game = results[0]; // Get the first result since game_id is unique
    // Mapping results to a structured format
    const gameDetails = {
      game_id: game.game_id,
      game_court_id: game.court_id,
      game_start_time: game.game_start_time,
      registration_open_time: game.registration_open_time,
      registration_close_time: game.registration_close_time,
      max_players: game.max_players,
      num_of_teams: game.num_of_teams,
      created_by: {
        user_id: game.created_by,
        username: game.creator_username // Getting the username of the creator
      }, location: game.location,
      description: game.description,
      mvp: {
        id: game.mvp,
        name: game.mvp_name // Getting the MVP's name from the join
      },
      max_players_each_user_can_add: game.max_players_each_user_can_add
    };

    // Sending the game data as a JSON response
    res.json(gameDetails);
  } catch (error) {
    // Logging the error for debugging purposes
    console.error('Error fetching game details:', error);

    // Responding with a 500 status code in case of server error
    res.status(500).json({ message: 'An error occurred while fetching game details.' });
  }
});

app.post('/api/register-players', authenticateToken, async (req, res) => {
  const { playersIds, gameId, userId } = req.body;
  try {
    // Prepare an array of promises for inserting players
    const promises = playersIds.map(playerId => {
      return promiseQuery(
        'INSERT IGNORE INTO registrations_to_game (game_id, player_id, registered_by) VALUES (?, ?, ?)',
        [gameId, playerId, userId]
      );
    });

    // Execute all promises concurrently
    await Promise.all(promises);

    res.status(200).send(`${playersIds.length} players registered successfully`);
  } catch (error) {
    console.error('Error registering players:', error);
    res.status(500).send('Error registering players');
  }
});






/* FETCH registered playeyrs for a GAME API ----------------------------------------------*/
app.get('/api/game_registrations/:game_id', authenticateToken, async (req, res) => {
  const gameId = req.params.game_id;

  try {
    // Query to fetch all registrations for the specified game
    const { results } = await promiseQuery(
      `SELECT rtg.*, p.name AS playerName, p.user_fk AS playerUserId 
       FROM registrations_to_game AS rtg
       JOIN players AS p ON rtg.player_id = p.id
       WHERE rtg.game_id = ?`,
      [gameId]
    );

    // Check if any game was found
    if (results.length === 0) {
      return res.status(404).json({ message: 'No registrations found for this game' });
    }

    const registrations = results.map(r => ({
      gameId: r.game_id,
      playerId: r.player_id,
      playerUserId: r.playerUserId,
      playerName: r.playerName,
      userIdCreator: r.registered_by,
      registrationDate: r.registration_time,
    }));

    res.json(registrations); // Return the registrations as JSON
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching registrations');
  }
});



//-----------CHECK IF CAN REGISTER MORE PLAYERS TO THE GAME-----//
app.get('/api/can-register-players-to-game/:game_id/:user_id', authenticateToken, async (req, res) => {
  const gameId = req.params.game_id;
  const userId = req.params.user_id;

  if (!gameId || !userId) {
    return res.status(400).send('Game ID and User ID are required');
  }

  try {
    // Query to count the number of players registered by the user for the specified game
    const { results } = await promiseQuery(
      'SELECT COUNT(*) AS playerCount FROM registrations_to_game WHERE game_id = ? AND registered_by = ?',
      [gameId, userId]
    );

    const playerCount = results[0].playerCount;

    res.status(200).json({
      message: 'User can register more players',
      playerCount,
    });
  } catch (error) {
    console.error('Error checking registration:', error);
    res.status(500).send('Error checking registration');
  }
});


/* DELETE player registration from a game ----------------------------------------------*/
app.delete('/api/game_registrations_deletion/:game_id/:player_id', authenticateToken, async (req, res) => {
  const { game_id, player_id } = req.params;

  try {
    // Query to delete the registration for the specified game and player
    const { results } = await promiseQuery(
      `DELETE FROM registrations_to_game WHERE game_id = ? AND player_id = ?`,
      [game_id, player_id]
    );

    // Check if the deletion was successful
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Registration not found for this game and player' });
    }

    res.json({ message: 'Player registration deleted successfully' }); // Return success message
  } catch (error) {
    console.error(error);
    res.status(500).send('Error deleting player registration');
  }
});


