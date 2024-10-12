import fs from 'fs';
import path from 'path';

function extractCityFromTxt(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const cityMatch = content.match(/城市：(.*)/);
  return cityMatch ? cityMatch[1].trim() : '城市信息未找到';
}

function processDirectory(directoryPath) {
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }
  let arr = [];
    files.forEach(file => {
      const filePath = path.join(directoryPath, file);

      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error('Error getting file stats:', err);
          return;
        }

        if (stats.isFile() && path.extname(file) === '.txt') {
          let content = fs.readFileSync(filePath, 'utf-8');
          let name = content.match(/姓名：(.*)/);
          let Card_holder_name = content.match(/持卡人：(.*)/);
          let Card_number = content.match(/卡号：(.*)/);
          let Expires = content.match(/过期时间：(.*)/);
          let CVC = content.match(/CVV：(.*)/);
          let Card_holder_postal_code = content.match(/邮编：(.*)/);
          let PIN = content.match(/PIN：(.*)/);
          fs.appendFile(newFile, `姓名：${name[1].trim()}\n持卡人：${Card_holder_name[1].trim()}\n卡号：${Card_number[1].trim()}\n过期时间：${Expires[1].trim()}\nCVC：${CVC[1].trim()}\n邮编：${Card_holder_postal_code[1].trim()}\n\n`, (err) => {
            if (err) {
              console.error('Error writing to file:', err);
            }
          });
        }
      });
    });
  });
}

const directory = 'C:\\Users\\Administrator\\Desktop\\详细';
const newFile = 'C:\\Users\\Administrator\\Desktop\\2713.txt';
processDirectory(directory);
