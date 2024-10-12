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
        let content = fs.readFileSync(filePath, 'utf-8');
        let Card_number = content.match(/卡号：(.*)/);
        let Expires = content.match(/过期时间：(.*)/);
        let CVC = content.match(/CVV：(.*)/);
        if (Card_number[1].trim().length === 16 && CVC[1].trim().length === 3) {
          fs.appendFile(newFile, `${Card_number[1].trim()}|${Expires[1].trim().replace('/','|20')}|${CVC[1].trim()}\n`, (err) => {
            if (err) {
              console.error('Error writing to file:', err);
            }
          });
        }
      });
    });
  });
}

const directory = 'C:\\Users\\Administrator\\Desktop\\详细0';
const newFile = 'C:\\Users\\Administrator\\Desktop\\验卡2813.txt';
processDirectory(directory);
