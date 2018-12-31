var createError = require('http-errors');
var cred = require('./credentials.json');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var fs = require('fs');

var CronJob = require('cron').CronJob;
var Twitter = require('twitter');
var mysql = require('mysql');

var app = express();

var t = new Twitter(cred['twitter']);
var conn = mysql.createConnection(cred['mysql']);

function updateMeta() {
  conn.query("SELECT * FROM meta", (err, res, fields) => {
    //console.log(res);
    if (!err) {
      res.forEach((row) => {
        if (row["ready"] == false) {
          var params = {screen_name: row["screen_name"]}
          t.get("users/show", params).then((user) => {
            updateID(row['id'], user['id_str']);
          }).catch((err) => {
            if (err) {
              console.log(err);
              console.log(params);
              console.log("ready == false");
            }
          });
        } else {
          var params = {user_id: row["id"]}
          t.get("users/show", params).then((user) => {
            updateSN(row['id'], user['screen_name']);
          }).catch((err) => {
            if (err) {
              console.log(err);
              console.log(params);
              console.log("ready == true");
            }
          });
        }
      });
    }
  })
}

function updateID(oldID, newID) {
  conn.query("UPDATE meta SET id = ?, ready = 1 WHERE id = ?", [newID, oldID], (err, res, fields) => {
    if (!err) {
      //console.log(res);
    } else {
      console.log("updateID error");
      console.log(err);
    }
  });
}

function updateSN(oldID, newSN) {
  conn.query("UPDATE meta SET screen_name = ? WHERE id = ?", [newSN, oldID], (err) => {
    if (!err) {
      //console.log(res);
    } else {
      console.log("updateSN error");
      console.log(err);
    }
  });
}



updateMeta();

// var mode = 1;
//
// if (mode == 1) {
//   var targets = {}
//   var proms = [];
//   Object.keys(pretargets).forEach((candidate) => {
//     targets[candidate] = [];
//     pretargets[candidate].forEach((screen_name) => {
//       proms.push(t.get('users/show', {screen_name})
//         .then((user) => {
//           console.log(screen_name, user.screen_name);
//           //console.log(user.id);
//           targets[candidate].push({"id": user.id, "screen_name": user.screen_name, "name": user.name, "relation": "official"});
//         })
//         .catch((error) => {
//           console.log(error);
//           throw error;
//         })
//       );
//     })
//   })
//
//   Promise.all(proms)
//     .then(() => {
//       console.log("done")
//       fs.writeFileSync("targets/targets.json", JSON.stringify(targets));
//       console.log("written");
//     })
//     .catch((err) => {
//       console.log('err oops');
//     })
// } else if (mode == 2) {
//
// }




module.exports = app;
