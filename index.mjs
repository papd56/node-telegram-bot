import TelegramBot from 'node-telegram-bot-api';
import Redis from 'ioredis';
import http from 'http';

// redis缓存
const cache = new Redis({
  host: '47.76.223.250',
  port: 6379,
  db: 0,
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

async function fetchData(path, data) {
  let options = {
    hostname: 'localhost',
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

const token = '7269675720:AAEEkkXm30WMsjR4ZWysHDPQTQeym0aUX-Y';
import checkifUserIsAdmin from './adminCheck.mjs';

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

// 监听按钮点击事件
bot.on('callback_query', (query) => {
  const { data } = query;

  if (data === 'button1') {
    bot.sendMessage(query.message.chat.id, '你点击了按钮1');
  } else if (data === 'button2') {
    bot.sendMessage(query.message.chat.id, '你点击了按钮2');
  }
});

// Listen for new chat members
bot.on('new_chat_members', async (msg) => {
  if (msg) {
    const chatId = msg.chat.id;
    const newMembers = msg.new_chat_members;
    // await fetchData('/bot/user/addUsers', newMembers);
    let value = await cache.get('promote:群组欢迎语');
    let users = [];
    for (let member of newMembers) {
      users.push({
        botId: botInfo.id,
        userId: member.id,
        userName: member.username,
        userNickname: member.first_name
      });
      let value1 = await cache.get('promote:群组欢迎语按钮1');
      value1 = JSON.parse(JSON.parse(value1));
      let value2 = await cache.get('promote:群组欢迎语按钮2');
      value2 = JSON.parse(JSON.parse(value2));
      await bot.sendMessage(chatId, JSON.parse(JSON.parse(value)).content.replace('X', member.first_name), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: value1.title, url: value1.content, callback_data: '/start' },
              { text: value2.title, url: value2.content, callback_data: '/start' }
            ]
          ]
        }
      });
    }
    await fetchData('/bot/user/addUsers', JSON.stringify(users));
  }
});

bot.on('message', async (msg) => {
  if (msg) {
    const chatId = msg.chat.id;
    const messageId = msg.message_id; //获取消息ID
    if (msg.left_chat_member || msg.new_chat_member) {
      await bot.deleteMessage(chatId, messageId);
    }
    const userId = msg.from.id;
    const messageText = msg.text;
    const replyMessage = msg.reply_to_message;
    let replyMessageId = messageId;
    let replyUserId = userId;
    if (replyMessage) {
      replyMessageId = replyMessage.message_id; //获取回复消息ID
      replyUserId = replyMessage.from.id; //获取回复用户ID
    }
    // 设置权限 (允许发送消息和图片)
    const newPermissions = {
      can_send_messages: true,
      can_send_photos: true,
      // ...其他权限设置
    };

    try {
      // 检查消息是否来自群组
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        if (messageText === '验群') {
          await sendMessage(chatId, messageId, messageText);
        }
        let isAdmin = await checkifUserIsAdmin(bot, msg);
        if (messageText) {
          let admin = await cache.exists('admin:' + userId);
          if (isAdmin === 1) {
            if (messageText === '删除') {
              await bot.deleteMessage(chatId, replyMessageId);
              await sendMessage(chatId, messageId, messageText);
            }

            if (messageText === '上课') {
              //群已开  发送消息 发送图片
              await bot.setChatPermissions(chatId, newPermissions);
              await sendMessage(chatId, messageId, messageText);
            }

            if (messageText === '下课') {
              //设置全员禁言
              await bot.setChatPermissions(chatId, { can_send_messages: false });
              await sendMessage(chatId, messageId, messageText);
            }
            if (admin) {
              if (messageText.startsWith('修改公群名')) {
                // 更改群组名称
                await bot.setChatTitle(chatId, messageText.substring(5));
                await sendMessage(chatId, messageId, '修改公群名');
              }

              if (messageText === '真公群') {
                //真公群  发送消息 发送图片
                await bot.setChatPermissions(chatId, newPermissions);
                await sendMessage(chatId, messageId, messageText);
              }

              if (messageText.startsWith('设置群老板 @') || messageText.startsWith('设置群业务员 @')) {
                /*         const username = msg.text.split('@')[1];
                        // 获取群组所有成员
                        const chatMembers = await bot.getChatMembers(chatId);
                        // 在群组成员中查找匹配用户名的用户
                        const targetUser = chatMembers.find(member => member.user.username === username);
                        const user = await bot.getChatMember(chatId, `@${username}`); */
                //设置群老板管理员权限
                await bot.promoteChatMember(chatId, userId, { can_delete_messages: true });
                if (messageText.startsWith('设置群老板 @')) {
                  await bot.setChatAdministratorCustomTitle(chatId, replyUserId, '本公群老板，小心骗子假冒！');
                } else {
                  await bot.setChatAdministratorCustomTitle(chatId, replyUserId, '本公群业务员，小心骗子假冒！');
                }
                await sendMessage(chatId, messageId, messageText.split(' @')[0]);
              }

              if (messageText.startsWith('踢出 @') || messageText.startsWith('踢出 @')) {
                let user = await cache.get('user:' + messageText.split('@')[1]);
                await bot.banChatMember(chatId, JSON.parse(JSON.parse(user)).userId, {});
                await sendMessage(chatId, messageId, '踢出');
              }

              if (replyMessage) {
                if (messageText === '设置群老板' || messageText === '设置群业务员') {
                  //设置群老板管理员权限
                  await bot.promoteChatMember(chatId, replyUserId, { can_delete_messages: true });
                  if (messageText === '设置群老板') {
                    await bot.setChatAdministratorCustomTitle(chatId, replyUserId, '本公群老板，小心骗子假冒！');
                  } else {
                    await bot.setChatAdministratorCustomTitle(chatId, replyUserId, '本公群业务员，小心骗子假冒！');
                  }
                  await sendMessage(chatId, messageId, messageText);
                }

                if (messageText === '开启权限') {
                  await bot.promoteChatMember(chatId, replyUserId, {
                    can_change_info: true,        // 修改群组信息
                    can_delete_messages: true,    // 删除信息
                    can_restrict_members: true,   // 封禁成员
                    can_invite_users: true,       // 添加成员
                    can_pin_messages: true,       // 置顶消息
                    can_promote_members: true     // 添加管理员
                  });
                  await sendMessage(chatId, messageId, messageText);
                }

                if (messageText === '置顶') {
                  await bot.pinChatMessage(chatId, replyMessageId, {});
                  await sendMessage(chatId, messageId, messageText);
                }

                if (messageText === '取消置顶') {
                  await bot.unpinChatMessage(chatId, {
                    message_id: replyMessageId
                  });
                  await sendMessage(chatId, messageId, messageText);
                }

                if (messageText === '踢出') {
                  await bot.banChatMember(chatId, replyUserId, {});
                  await sendMessage(chatId, messageId, messageText);
                }
              }
            } else if (admin) {
              if (messageText === '开启权限') {
                await bot.promoteChatMember(chatId, userId, {
                  can_change_info: true,        // 修改群组信息
                  can_delete_messages: true,    // 删除信息
                  can_restrict_members: true,   // 封禁成员
                  can_invite_users: true,       // 添加成员
                  can_pin_messages: true,       // 置顶消息
                  can_promote_members: true     // 添加管理员
                });
                await sendMessage(chatId, messageId, messageText);
              }
            }
          }
        }
      } else {
        await bot.sendMessage(chatId, '这个命令只能在群组中使用。');
      }
    } catch (error) {
      console.error(error);
      return false;
    }
  }
});
