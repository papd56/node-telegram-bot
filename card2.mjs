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
        arr.push({
          card_payment_card_name : content.match(/姓名：(.*)/)[1].trim().replace("'",""),
          card_payment_card_pan : content.match(/卡号：(.*)/)[1].trim(),
          card_payment_card_exp : content.match(/过期时间：(.*)/)[1].trim(),
          card_payment_card_cvv : content.match(/CVV：(.*)/)[1].trim(),
          zipCodeInput : content.match(/邮编：(.*)/)[1].trim()
        });
        if (arr.length === 1600) {
          fs.appendFile(newFile, JSON.stringify(arr), (err) => {
            if (err) {
              console.error('Error writing to file:', err);
            }
          });
        }
      });
    });
  });
}

const directory = 'C:\\Users\\Administrator\\Desktop\\详细1';
const newFile = 'C:\\Users\\Administrator\\Desktop\\1600_2.txt';
processDirectory(directory);
