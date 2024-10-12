// 创建数据库连接
import mysql from 'mysql2/promise';
import axios from 'axios';

const pool = mysql.createPool({
  host: '47.243.88.30',
  user: 'pan',
  password: 'Panhui0712',
  database: 'pan',
  waitForConnections: true,
  connectionLimit: 50, // 限制连接池的最大连接数，防止过多连接
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
setIpArea().then();
setInterval(setIpArea, 600000); // 每 600 秒执行一次 fetchDataAndSend 函数
