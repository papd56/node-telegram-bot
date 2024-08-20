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

// Listen for new chat members
bot.on('new_chat_members', async (msg) => {
  if (msg) {
    const chatId = msg.chat.id;
    if (msg.new_chat_member.id === botInfo.id) {
      let group = {
        botId: botInfo.id,
        groupId: chatId,
        groupName: msg.chat.title
      };
      await fetchData('/bot/group/addGroup', JSON.stringify(group));
    }
    const newMembers = msg.new_chat_members;
    // await fetchData('/bot/user/addUsers', newMembers);
    let value = await cache.get('promote:群组欢迎语');
    let users = [];
    for (let member of newMembers) {
      let value1 = await cache.get('promote:群组欢迎语按钮1');
      value1 = JSON.parse(JSON.parse(value1));
      let value2 = await cache.get('promote:群组欢迎语按钮2');
      value2 = JSON.parse(JSON.parse(value2));
      let message = await bot.sendMessage(chatId, JSON.parse(JSON.parse(value)).content.replace('X', member.first_name), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: value1.title, url: value1.content, callback_data: '/start' },
              { text: value2.title, url: value2.content, callback_data: '/start' }
            ]
          ]
        }
      });
      let time = await cache.get('promote:消息自焚时间');
      time = JSON.parse(JSON.parse(time)).content;
      setTimeout(() => {
        bot.deleteMessage(chatId, message.message_id);
      }, time*1000);
      let flag = await cache.exists('user:'+member.username);
      if (!flag) {
        users.push({
          botId: botInfo.id,
          userId: member.id,
          userName: member.username,
          userNickname: member.first_name
        });
      }
    }
    await fetchData('/bot/user/addUsers', JSON.stringify(users));
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
      await cache.set('pin:' + msg.pinned_message.message_id, msg.pinned_message);
    }

    try {
      // 检查消息是否来自群组
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        if (messageText === '验群') {
          let time = await cache.get('time:' + messageText);
          if (time === null || Date.now() - time >= 300000) {
            await sendMessage(chatId, messageId, messageText);
            await cache.set('time:' + messageText, Date.now());
          }
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
              if (messageText.startsWith('修改公群群名')) {
                let groupName = messageText.substring(6);
                // 更改群组名称
                await bot.setChatTitle(chatId, groupName);
                await sendMessage(chatId, messageId, '修改公群群名');
                let group = {
                  botId: botInfo.id,
                  groupId: chatId,
                  groupName: groupName
                };
                await fetchData('/bot/group/editGroup', JSON.stringify(group));
              }

              if (messageText === '设置简介') {
                await bot.setChatDescription(chatId, replyMessage.text);
                await sendMessage(chatId, messageId, messageText);
              }

              if (messageText === '担保关闭') {
                if (!msg.chat.title.includes('已退押')) {
                  let groupName = msg.chat.title.split('已押')[0] + '已退押';
                  await bot.setChatTitle(chatId, groupName);
                  let group = {
                    botId: botInfo.id,
                    groupId: chatId,
                    groupName: groupName
                  };
                  await fetchData('/bot/group/editGroup', JSON.stringify(group));
                }
                await bot.setChatDescription(chatId, '-');
                await bot.setChatDescription(chatId, '');

                // 获取群组管理员信息并下掉非官方管理
                await bot.getChatAdministrators(chatId)
                  .then(async (admins) => {
                    for (let admin of admins) {
                      let flag = await cache.exists('admin:' + admin.user.id);
                      if (!flag) {
                        // 将该用户降级为普通用户
                        bot.promoteChatMember(chatId, admin.user.id, {
                          can_manage_chat: false,
                          can_change_info: false,        // 修改群组信息
                          can_delete_messages: false,    // 删除信息
                          can_restrict_members: false,   // 封禁成员
                          can_invite_users: false,       // 添加成员
                          can_pin_messages: false,       // 置顶消息
                          can_promote_members: false     // 添加管理员
                        }).catch((error) => {
                          console.error('Error demoting user:', error);
                        });
                      }
                    }
                  })
                  .catch((error) => {
                    console.error('Error fetching administrators:', error);
                  });

                scanKeys('pin:*').then(async keys => {
                  if (keys.length > 0) {
                    for (let key of keys) {
                      await bot.unpinChatMessage(chatId, {
                        message_id: key.substring(4)
                      });
                    }
                    cache.del(keys);
                  }
                }).then(async () => {
                  let value = await cache.get('promote:' + messageText);
                  value = JSON.parse(JSON.parse(value)).content.split('--分隔符--');
                  await bot.sendMessage(chatId, value[0], {
                    reply_to_message_id: messageId,
                  });
                  let message = await bot.sendMessage(chatId, value[1]);
                  await bot.pinChatMessage(chatId, message.message_id);
                });
              }

              if (messageText === '显示公群群名') {
                await bot.sendMessage(chatId, msg.chat.title, {
                  reply_to_message_id: messageId,
                });
              }

              if (messageText === '真公群') {
                //真公群  发送消息 发送图片
                await bot.setChatPermissions(chatId, newPermissions);
                await sendMessage(chatId, messageId, messageText);
              }

              if (messageText.startsWith('设置群老板 @') || messageText.startsWith('设置群业务员 @')) {
                let user = await cache.get('user:' + msg.text.split(' @')[1]);
                user = JSON.parse(JSON.parse(user));
                await bot.promoteChatMember(chatId, user.userId, { can_delete_messages: true });
                if (messageText.startsWith('设置群老板 @')) {
                  await bot.setChatAdministratorCustomTitle(chatId, user.userId, '本公群老板，小心骗子假冒！');
                } else {
                  await bot.setChatAdministratorCustomTitle(chatId, user.userId, '本公群业务员，小心骗子假冒！');
                }
                await sendMessage(chatId, messageId, messageText.split(' @')[0]);
              }

              if (messageText.startsWith('移除管理 @') || messageText.startsWith('移除管理 @')) {
                let user = await cache.get('user:' + messageText.split('@')[1]);
                await bot.promoteChatMember(chatId, JSON.parse(JSON.parse(user)).userId, {
                  can_change_info: false,        // 修改群组信息
                  can_delete_messages: false,    // 删除信息
                  can_restrict_members: false,   // 封禁成员
                  can_invite_users: false,       // 添加成员
                  can_pin_messages: false,       // 置顶消息
                  can_promote_members: false     // 添加管理员
                });
                await sendMessage(chatId, messageId, '移除管理');
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
                  await cache.del('pin:' + replyMessageId);
                }

                if (messageText === '踢出') {
                  await bot.banChatMember(chatId, replyUserId, {});
                  await sendMessage(chatId, messageId, messageText);
                }
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
      } else {
        await bot.sendMessage(chatId, '这个命令只能在群组中使用。');
      }
    } catch (error) {
      console.error(error);
      return false;
    }
  }
});
