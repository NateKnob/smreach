var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var fs = require('fs');

var CronJob = require('cron').CronJob;
var Twitter = require('twitter');
var mysql = require('mysql');

var app = express();

var cred = {};

console.log(process.env);
console.log("HELLO???");

if (process.env.NODE_ENV == "production") {
  cred['twitter'] = {
    "consumer_key": process.env.twitter_consumer_key,
    "consumer_secret": process.env.twitter_consumer_secret,
    "access_token_key": process.env.twitter_access_token_key,
    "access_token_secret": process.env.twitter_access_token_secret,
  }
  cred['mysql'] = {
    "host"     : process.env.mysql_host,
    "user"     : process.env.mysql_user,
    "password" : process.env.mysql_password,
    "database" : process.env.mysql_database
  }
} else {
  cred = require('./credentials.json');
}

var t = new Twitter(cred['twitter']);
var conn = mysql.createConnection(cred['mysql']);

function updateMeta() {
  conn.query("SELECT * FROM meta", (err, res, fields) => {
    //console.log(res);
    if (!err) {
      res.forEach((row) => {
        if (row['ready'] == false) {
          var params = {screen_name: row["screen_name"]}
          t.get("users/show", params).then((user) => {
            updateID(row['id'], user['id_str']);
            createTable("twitter_" + user['id_str']);
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
    } else {
      console.log("err!!!");
      console.log(err);
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

function scrapeFollowers() {

  var datetime = new Date();
  var datestring = datetime.toUTCString();

  conn.query("SELECT * FROM meta", (err, res, fields) => {
    if (err) {
      console.log("err!!!");
      console.log(err);
    } else {
      res.forEach((row) => {
        var params = {user_id: row['id']};
        var tablename = "twitter_" + row['id'].toString()

        t.get("users/show", params).then((user) => {
          conn.query("INSERT INTO " + tablename + " (date, followers) VALUES ?", [[[datestring, user.followers_count]]], (err, res, fields) => {
            if (!err) {
              //console.log("inserted correctly!");
            } else {
              console.log("insert error");
              console.log(err);
            }
          });
        }).catch((err) => {
          if (err) {
            console.log(err);
            updateMeta();
          }
        })
      });
    }
  });
}

function doesTableExist(table) {
  conn.query("SELECT * FROM ?", [table], (err, res) => {
    if (!err) {
      return true;
    }
    return false;
  });
}

function createTable(tablename) {
  var sql = "CREATE TABLE " + tablename + " (date VARCHAR(256), followers INT)";
  conn.query(sql, (err, res) => {
    if (!err) {
      console.log("Created Table", tablename);
    } else {
      console.log("Create Table Error on", tablename);
      console.log(err)
    }
  });
}


updateMeta();
new CronJob("0 0 */6 * * *", () => {
  console.log("update meta");
  updateMeta();
}, null, true, 'America/New_York');

new CronJob("0 0 * * * *", () => {
  console.log("scrape followers");
  scrapeFollowers();
}, null, true, 'America/New_York');


function getTableData() {
  return new Promise((resolve, reject) => {
    conn.query("SELECT * FROM meta", (err, meta, fields) => {
      var x = meta.length;
      var data = []
      meta.forEach((row) => {
        var params = {user_id: row['id']};
        var tablename = "twitter_" + row['id'].toString()

        conn.query("SELECT * FROM " + tablename, (err, tableres, fields) => {
          if (!err) {
            data.push({"meta":row, "table":tableres});
            x -= 1;
            if (x == 0) {
              resolve(data);
            }
            //console.log("inserted correctly!");
          } else {
            reject(err);
            console.log("insert error");
            console.log(err);
          }
        });
      });

      if (err) {
        reject(err);
      }
    });
  });
}

function diffDay(d1, d2) {
  return !(d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate());
}

async function updateCachedTable() {
  try {
    initialTable = await getTableData();
    // for each twitter account
    console.log("yayeet");
    for (var i = 0; i < initialTable.length; i++) {
      var meta = initialTable[i]['meta'];
      var table = initialTable[i]['table'];

      var newTable = [];
      var today = new Date(table[0]['date']);
      newTable.push(table[0]);
      for (var t = 1; t < table.length; t++) {
        var tomorrow = new Date(table[i]);
        if (diffDay(today, tomorrow)) {
          today = tomorrow;
          newTable.push(table[i]);
        }
      }
      //console.log(meta['screen_name']);
      initialTable[i]['table'] = newTable;
    }
    console.log("yayeet2");
    return initialTable;

  } catch (err) {
    console.log("ERR!", err);
    return "err";
  }
}

var cachedTable = updateCachedTable();
var tableCacheTime = new Date();

app.get('/update/', function(req, res) {
  updateMeta();
  scrapeFollowers();
  res.send("done!");
});

app.get('/', function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    //res.send(JSON.stringify({ a: 1 }));
    cacheAge = new Date().getTime() - tableCacheTime.getTime();
    if (cacheAge > 5000) {
      cachedTable = updateCachedTable();
      tableCacheTime = new Date();
      res.send(JSON.stringify({"status":"refreshed", "table":cachedTable}));
    } else {
      res.send(JSON.stringify({"status":"old", "table":cachedTable}));
    }

});

var port = process.env.PORT || 3000;

var server = app.listen(port, function () {
    console.log('Server running at http://127.0.0.1:' + port + '/');
});
