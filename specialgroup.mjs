import TelegramBot from 'node-telegram-bot-api';
import Redis from 'ioredis';
import http from 'http';
import { DateTime } from 'luxon';
import checkifUserIsAdmin from './adminCheck.mjs';

async function fetchData(path, data) {
  let options = {
    hostname: '8.217.124.68',
    port: 8897,
    path: path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  let req = http.request(options, (res) => {
    // 不处理响应数据
  });
  req.on('error', (error) => {
    console.error(error);
  });
  req.write(data);
  req.end();
}

await fetchData('/redisCache/list', '');
/* async function main() {
  try {
    const promoteList = await fetchData('/bot/promote/promoteList');
    const userList = await fetchData('/bot/user/userList');
  } catch (error) {
    console.error(error);
  }
}
main(); */

// redis缓存
const host = '8.217.124.68';
const cache = new Redis({
  host: host,
  port: 6379,
  db: 0,
  password: 123456,
  retryStrategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      // Handle ECONNREFUSED differently
      console.error('Redis connection refused');
      return new Error('Redis connection refused');
    }

    if (options.attempt > 10) {
      // End reconnecting on a specific error and flush all commands with
      // individual error
      console.error('Redis connection failed after 10 attempts');
      return new Error('Too many retry attempts');
    }

    if (options.total_retry_time > 1000 * 60 * 5) {
      // End reconnecting after a specific timeout and flush all commands
      // with individual error
      console.error('Redis connection failed after 5 minutes');
      return new Error('Retry time exhausted');
    }

    if (options.error !== undefined && options.error.code === 'ECONNRESET' && options.attempt < 10) {
      // End reconnecting on a specific error and flush all commands with
      // individual error
      console.error('Redis connection reset');
      return new Error('Redis connection reset');
    }

    // reconnect after
    return Math.min(options.attempt * 100, 3000);
  },
  connect_timeout: 1000, // 连接超时时间
  idleTimeout: 60000
});

cache.on('error', (error) => {
  console.error('redis error:', error);
});

const scanKeys = async (pattern) => {
  const keys = [];
  let cursor = 0;
  do {
    const res = await cache.scan(cursor, 'MATCH', pattern);
    cursor = res[0];
    keys.push(...res[1]);
  } while (cursor !== '0');
  return keys;
};

const token = '7527546955:AAHZ_9wREC2hLVq39lCEYn_H8y-5lm_L6I0';

const bot = new TelegramBot(token, {
  polling: true,
  request: {
    agentOptions: {
      keepAlive: true,
      family: 4
    }
  }
});

let botInfo = await bot.getMe();

async function sendMessage(chatId, messageId, messageText) {
  let value = await cache.get('promote:' + messageText);
  await bot.sendMessage(chatId, JSON.parse(JSON.parse(value)).content, {
    reply_to_message_id: messageId,
  });
}

// Listen for new chat members
bot.on('new_chat_members', async (msg) => {
  if (msg) {
    const chatId = msg.chat.id;
    const newMembers = msg.new_chat_members;
    for (let member of newMembers) {
      await bot.sendMessage(chatId, '欢迎 ' + member.first_name + ' 进群' + ',' + 'tgid ' + member.id + ',' + 'tg注册时间为2021-11-10后');
    }
    let users = [];
    users.push({
      botId: botInfo.id,
      userId: member.id,
      userName: member.username,
      userNickname: member.first_name
    });
    await cache.hset(member.username, users);
  }
});

// 设置权限 (允许发送消息和图片)
const newPermissions = {
  can_send_messages: true,
  can_send_photos: true,
  // ...其他权限设置
};

bot.on('message', async (msg) => {
  if (msg) {
    const chatId = msg.chat.id;
    const messageId = msg.message_id; //获取消息ID
    if (msg.left_chat_member && msg.left_chat_member.id !== botInfo.id || msg.new_chat_member && msg.new_chat_member.id !== botInfo.id) {
      await bot.deleteMessage(chatId, messageId);
    }
    const userId = msg.from.id;
    let messageText = msg.text === undefined ? '' : msg.text.trim();
    const replyMessage = msg.reply_to_message;
    let replyMessageId = messageId;
    let replyUserId = userId;
    if (replyMessage) {
      replyMessageId = replyMessage.message_id; //获取回复消息ID
      replyUserId = replyMessage.from.id; //获取回复用户ID
    }
    if (msg.pinned_message) {
      await cache.set('pin:' + chatId + '_' + msg.pinned_message.message_id, msg.pinned_message);
    }

    try {
      // 检查消息是否来自群组
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        if (messageText === '验群') {
          let now = Date.now();
          let time = await cache.get('time:' + chatId + '_' + messageText);
          if (time === null || now - time >= 300000) {
            await sendMessage(chatId, messageId, messageText);
            await cache.set('time:' + chatId + '_' + messageText, now);
          }
        }
        let isAdmin = await cache.exists('admin:' + userId);
        if (isAdmin) {
          if (messageText) {
            if (messageText === '初始化') {
              //专群初始化
              await bot.sendMessage(chatId, '初始化成功').then(async () => {
                await bot.sendMessage(chatId, '初始化完成 该群是真群').then(async () => {
                  await bot.sendMessage(chatId, '您好，请先描述一下具体交易内容跟规则，交易员稍后将汇总编辑成交易详情给交易双方确认，然后开始交易。\n' +
                    '交易过程中为了避免不必要的纠纷，请按照我们的流程和步骤进行，感谢各位配合！\n' +
                    '担保流程：@dbliucheng   \n' +
                    '安全防范：@HuioneAQ\n' +
                    '汇旺担保核心群  @daqun 还没加群的老板可以加一下，有什么不清楚的地方可以随时问本群交易员\n' +
                    '\n' +
                    '⚠️进群后请认准群内官方人员的管理员身份，不是官方管理员身份发的上押地址，都是假冒的骗子，切勿相信！群内交易详情未确认，押金未核实到账，禁止交易，否则造成损失，自行承担责任，平台概不负责。\n' +
                    '\n' +
                    '⚠️汇旺担保工作人员作息时间：🕙早上上班时间：北京时间9点！  🕙晚上下班时间：北京时间3点！\n' +
                    '\n' +
                    '⚠️专群担保交易为一对一交易，所有交易记录需要在担保群内体现出来，禁止交易双方私下拉群交易，私下拉群交易不在本群担保范围内，特殊事项请联系本群交易员对接。\n' +
                    '\n' +
                    '温馨提示：\n' +
                    '1、交易方进交易群后，可以先上押再谈交易内容、规则。一个上押下押周期内，佣金不足20u的，以20u结算扣除手续费，上押前请交易双方务必斟酌好，是否已经协商交易内容规则。\n' +
                    '2、即日起，凡是车队（跑分、代收代付）专群跑分类交易开群上押要求必须上押800u起，普通交易不限制最低上押金额。\n' +
                    '3、请尽量使用冷钱包上押,不要用交易所直接提u上押,使用交易所提u上押的请上押时候说明是交易所提的u,并同时说明下押地址。\n' +
                    '4、由于群资源紧张，如本群当天无上押，即被回收；后续如需交易，请联系 @hwdb (https://t.me/hwdbwbot) 开新群。\n' +
                    '\n' +
                    '⚠️请供需双方确定一下各方负责人，以后是否下押以及下押到哪，需要交易详情上的供需双方负责人确认，决定权在负责人手里，本群为私群，只能对应一个供方负责人和一个需方负责人。请不要拉无关人员进群，谁拉进来的人谁负责。人进齐后请通知交易员锁群').then();
                });
              });

              if (messageText.startsWith('我是供方')) {
                await bot.sendMessage(chatId, '供方负责人', {
                  reply_to_message_id: messageId,
                });
                await bot.sendMessage(chatId, '供方负责人设置完成');
              }

              if (messageText.startsWith('我是需方')) {
                await bot.sendMessage(chatId, '需方负责人', {
                  reply_to_message_id: messageId,
                });
                await bot.sendMessage(chatId, '需方负责人设置完成');
              }

            }
          }
        } else {
          await bot.sendMessage(chatId, '这个命令只能在群组中使用。');
        }
      }
    } catch (error) {
      console.error(error);
      return false;
    }
  }
});

let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const initialRetryDelay = 2000; // 2秒

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
  reconnectAttempts++;

  if (reconnectAttempts > maxReconnectAttempts) {
    console.error('Maximum reconnect attempts reached, exiting...');
  } else {
    const retryDelay = initialRetryDelay * 2 ** (reconnectAttempts - 1);
    console.log(`Retrying in ${retryDelay} milliseconds...`);
    setTimeout(() => {
      bot.startPolling();
      reconnectAttempts = 0;
    }, retryDelay);
  }
});
