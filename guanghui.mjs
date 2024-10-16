import TelegramBot from 'node-telegram-bot-api';
import Redis from 'ioredis';
import axios from 'axios';
import { DateTime } from 'luxon';
import checkifUserIsAdmin from './adminCheck.mjs';
import NodeJieba from 'nodejieba';

// 初始化分词器
NodeJieba.load({
  userDict: 'dict.txt'
});

async function post(path, data) {
  return await axios.post('http://45.207.194.10:8080' + path, data);
}

await post('/redisCache/list');

// redis缓存
const cache = new Redis({
  host: '45.207.194.10',
  port: 6379,
  db: 0,
  password: 'Qwer1234..',
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

const token = '7487669911:AAEvSP2ehjCCeHPmkNhLfbo73rj1oQAdn-M';

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

setInterval(async () => {
  let groups = await cache.hgetall('group');
  for (let group of Object.values(groups)) {
    group = JSON.parse(JSON.parse(group));
    if (group.groupWelcome) {
      await cache.hget('welcome', group.groupId).then(async (welcome) => {
        if (welcome) {
          await bot.deleteMessage(group.groupId, welcome);
        }
      }).then(async () => {
        let value1 = await cache.get('promote:群组欢迎语按钮1');
        value1 = JSON.parse(JSON.parse(value1));
        let value2 = await cache.get('promote:群组欢迎语按钮2');
        value2 = JSON.parse(JSON.parse(value2));
        bot.sendMessage(group.groupId, group.groupWelcome, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: value1.title, url: value1.content, callback_data: '/start' },
                { text: value2.title, url: value2.content, callback_data: '/start' }
              ]
            ]
          }
        }).then(async (message) => {
          if (message) {
            await cache.hset('welcome', group.groupId, message.message_id);
          }
        });
      });
    }
  }
}, 10800000);

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
      await post('/bot/group/addGroup', group);
    }else {
      let users = [];
      for (let member of msg.new_chat_members) {
        let exists = await cache.exists('user:' + member.username);
        if (!exists) {
          users.push({
            botId: botInfo.id,
            userId: member.id,
            userName: member.username,
            userNickname: member.first_name
          });
        }
      }
      await post('/bot/user/addUsers', users);
    }
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
    const userId = msg.from.id;
    let messageText = msg.text === undefined ? '' : msg.text.trim();
    try {
      // 检查消息是否来自群组
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        if (msg.left_chat_member && msg.left_chat_member.id !== botInfo.id || msg.new_chat_member && msg.new_chat_member.id !== botInfo.id) {
          await bot.deleteMessage(chatId, messageId);
          return true;
        }else if (msg.pinned_message) {
          await cache.hset('pin:' + chatId, msg.pinned_message.message_id, '');
          return true;
        }else if (messageText === '验群') {
          let now = Date.now();
          let time = await cache.get('time:' + chatId + '_' + messageText);
          if (time === null || now - time >= 300000) {
            let value = await cache.get('promote:' + messageText);
            await bot.sendMessage(chatId, JSON.parse(JSON.parse(value)).content.replace('@hwgq','[@hwgq](https://t.me/hwgqpindao)'), {
              reply_to_message_id: messageId,
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            }).then( async () => {
              await cache.set('time:' + chatId + '_' + messageText, now);
            });
          }
          return true;
        }else {
          let admin = await cache.exists('admin:' + userId);
          let isAdmin = await checkifUserIsAdmin(bot, msg);
          if (isAdmin) {
            if (messageText) {
              if (messageText === '上课') {
                //群已开  发送消息 发送图片
                await bot.setChatPermissions(chatId, newPermissions);
                await sendMessage(chatId, messageId, messageText);
                return true;
              }else if (messageText === '下课') {
                //设置全员禁言
                await bot.setChatPermissions(chatId, { can_send_messages: false });
                await sendMessage(chatId, messageId, messageText);
                return true;
              }else if (admin) {
                let replyMessage = msg.reply_to_message;
                let replyMessageId = messageId;
                let replyUserId = userId;
                if (replyMessage) {
                  replyMessageId = replyMessage.message_id; //获取回复消息ID
                  replyUserId = replyMessage.from.id; //获取回复用户ID
                  if (messageText === '删除') {
                    await bot.deleteMessage(chatId, replyMessageId);
                    await bot.deleteMessage(chatId, messageId);
                    return true;
                  }else if (messageText === '禁言') {
                    await bot.restrictChatMember(chatId, replyUserId, {
                      until_date: 86400,
                      can_send_messages: false
                    });
                    await sendMessage(chatId, messageId, messageText);
                    return true;
                  }else if (messageText === '解封') {
                    await bot.restrictChatMember(chatId, replyUserId, {
                      can_send_messages: true,
                      can_send_media_messages: true,
                    });
                    await sendMessage(chatId, messageId, messageText);
                    return true;
                  }else if (messageText === '踢出') {
                    await bot.banChatMember(chatId, replyUserId);
                    await sendMessage(chatId, messageId, messageText);
                    return true;
                  }else if (messageText === '置顶') {
                    await bot.pinChatMessage(chatId, replyMessageId);
                    await sendMessage(chatId, messageId, messageText);
                    await cache.hset('pin:' + chatId, replyMessageId, '');
                    return true;
                  }else if (messageText === '取消置顶') {
                    await bot.unpinChatMessage(chatId, {
                      message_id: replyMessageId
                    });
                    await sendMessage(chatId, messageId, messageText);
                    await cache.hdel('pin:' + chatId, replyMessageId);
                    return true;
                  }else if (messageText === '设置简介') {
                    await bot.setChatDescription(chatId, '-');
                    await bot.setChatDescription(chatId, replyMessage.text);
                    await sendMessage(chatId, messageId, messageText);
                    return true;
                  }else if (messageText === '设置群老板' || messageText === '设置群业务员') {
                    //设置群老板管理员权限
                    await bot.promoteChatMember(chatId, replyUserId, { can_delete_messages: true });
                    let group = await cache.hget('group', chatId);
                    group = JSON.parse(JSON.parse(group));
                    if (messageText === '设置群老板') {
                      await bot.setChatAdministratorCustomTitle(chatId, replyUserId, '本公群老板，小心骗子假冒！');
                      group.groupBoss = replyMessage.from.first_name + ' @' + replyMessage.from.username;
                    } else {
                      await bot.setChatAdministratorCustomTitle(chatId, replyUserId, '本公群业务员，小心骗子假冒！');
                      group.groupSalesman += '\n' + replyMessage.from.first_name + ' @' + replyMessage.from.username;
                    }
                    await sendMessage(chatId, messageId, messageText);
                    await post('/bot/group/editGroup', group);
                    return true;
                  }else if (messageText === '移除管理') {
                    await bot.promoteChatMember(chatId, replyUserId, {
                      can_change_info: false,        // 修改群组信息
                      can_delete_messages: false,    // 删除信息
                      can_restrict_members: false,   // 封禁成员
                      can_invite_users: false,       // 添加成员
                      can_pin_messages: false,       // 置顶消息
                      can_promote_members: false     // 添加管理员
                    });
                    await sendMessage(chatId, messageId, messageText);
                    return true;
                  }else if (messageText === '设置公群头像') {
                    // 确保消息包含图片
                    if (replyMessage.photo) {
                      // 使用setChatPhoto方法设置群头像，传入最后一张最大尺寸的图片photoStream作为photo参数
                      bot.setChatPhoto(chatId, bot.getFileStream(replyMessage.photo.pop().file_id)).catch((error) => {
                        console.error('设置群头像失败：', error);
                      });
                    }
                  }
                } else {
                  if (messageText.startsWith('禁言 @')) {
                    let users = messageText.substring(4).split('@');
                    for (let user of users) {
                      user =  await cache.get('user:' + user.trim());
                      await bot.restrictChatMember(chatId, JSON.parse(JSON.parse(user)).userId, {
                        until_date: 86400,
                        can_send_messages: false
                      });
                    }
                    await sendMessage(chatId, messageId, '禁言');
                    return true;
                  }else if (messageText.startsWith('解封 @')) {
                    let users = messageText.substring(4).split('@');
                    for (let user of users) {
                      user =  await cache.get('user:' + user.trim());
                      await bot.restrictChatMember(chatId, JSON.parse(JSON.parse(user)).userId, {
                        can_send_messages: true,
                        can_send_media_messages: true,
                      });
                    }
                    await sendMessage(chatId, messageId, '解封');
                    return true;
                  }else if (messageText.startsWith('踢出 @')) {
                    let users = messageText.substring(4).split('@');
                    for (let user of users) {
                      user =  await cache.get('user:' + user.trim());
                      await bot.banChatMember(chatId, JSON.parse(JSON.parse(user)).userId);
                    }
                    await sendMessage(chatId, messageId, '踢出');
                    return true;
                  }else if (messageText.startsWith('修改公群群名')) {
                    let group = await cache.hget('group', chatId);
                    group = JSON.parse(JSON.parse(group));
                    group.groupName = messageText.substring(6);
                    // 更改群组名称
                    await bot.setChatTitle(chatId, group.groupName);
                    await sendMessage(chatId, messageId, '修改公群群名');
                    await post('/bot/group/editGroup', group);
                    return true;
                  }else if (messageText === '显示公群群名') {
                    await bot.sendMessage(chatId, msg.chat.title, {
                      reply_to_message_id: messageId,
                    });
                    return true;
                  }else if (messageText.startsWith('设置群老板 @') || messageText.startsWith('设置群业务员 @')) {
                    let user = await cache.get('user:' + messageText.split(' @')[1]);
                    user = JSON.parse(JSON.parse(user));
                    await bot.promoteChatMember(chatId, user.userId, { can_delete_messages: true });
                    let group = await cache.hget('group', chatId);
                    group = JSON.parse(JSON.parse(group));
                    if (messageText.startsWith('设置群老板 @')) {
                      await bot.setChatAdministratorCustomTitle(chatId, user.userId, '本公群老板，小心骗子假冒！');
                      group.groupBoss = user.userNickname + ' @' + user.userName;
                    } else {
                      await bot.setChatAdministratorCustomTitle(chatId, user.userId, '本公群业务员，小心骗子假冒！');
                      group.groupSalesman += '\n' + user.userNickname + ' @' + user.userName;
                    }
                    await sendMessage(chatId, messageId, messageText.split(' @')[0]);
                    await post('/bot/group/editGroup', group);
                    return true;
                  }else if (messageText.startsWith('移除管理 @')) {
                    let users = messageText.substring(6).split('@');
                    for (let user of users) {
                      user =  await cache.get('user:' + user.trim());
                      await bot.promoteChatMember(chatId, JSON.parse(JSON.parse(user)).userId, {
                        can_change_info: false,        // 修改群组信息
                        can_delete_messages: false,    // 删除信息
                        can_restrict_members: false,   // 封禁成员
                        can_invite_users: false,       // 添加成员
                        can_pin_messages: false,       // 置顶消息
                        can_promote_members: false     // 添加管理员
                      });
                    }
                    await sendMessage(chatId, messageId, '移除管理');
                    return true;
                  }else if (messageText.startsWith('设置广告') && messageText.length > 4) {
                    let group = await cache.hget('group', chatId);
                    group = JSON.parse(JSON.parse(group));
                    group.groupWelcome = messageText.substring(4);
                    await post('/bot/group/editGroup', group);
                    await sendMessage(chatId, messageId, '设置广告');
                  }else if (messageText.startsWith('修改广告') && messageText.length > 4) {
                    let group = await cache.hget('group', chatId);
                    group = JSON.parse(JSON.parse(group));
                    group.groupWelcome = messageText.substring(4);
                    await post('/bot/group/editGroup', group);
                    await sendMessage(chatId, messageId, '修改广告');
                  }else if (messageText === '关闭广告') {
                    let group = await cache.hget('group', chatId);
                    group = JSON.parse(JSON.parse(group));
                    group.groupWelcome = '';
                    await post('/bot/group/editGroup', group);
                    await sendMessage(chatId, messageId, '关闭广告');
                  }else if (messageText.startsWith('设置欢迎语') && messageText.length > 5) {
                    let group = await cache.hget('group', chatId);
                    group = JSON.parse(JSON.parse(group));
                    group.groupWelcome = messageText.substring(5);
                    await post('/bot/group/editGroup', group);
                    await sendMessage(chatId, messageId, '设置欢迎语');
                    return true;
                  }else if (messageText === '关闭欢迎语') {
                    let group = await cache.hget('group', chatId);
                    group = JSON.parse(JSON.parse(group));
                    group.groupWelcome = '';
                    await post('/bot/group/editGroup', group);
                    await sendMessage(chatId, messageId, '关闭欢迎语');
                    return true;
                  }else if (messageText.startsWith('设置简介')) {
                    await bot.setChatDescription(chatId, '-');
                    await bot.setChatDescription(chatId, messageText.substring(4));
                    await sendMessage(chatId, messageId, '设置简介');
                    return true;
                  }else if (messageText === '初始化') {
                    //初始化  发送消息 图片 视频 语音消息
                    await bot.setChatPermissions(chatId, {
                      can_send_messages: true,
                      can_send_media_messages: false,
                      can_send_photos: true,
                      can_send_videos: true,
                      can_send_voice_notes: true,
                      can_send_polls: false,
                      can_send_other_messages: false,
                      can_add_web_page_previews: false,
                      can_change_info: false,
                      can_invite_users: false,
                      can_pin_messages: false,
                      // ...其他权限设置
                    });
                    await sendMessage(chatId, messageId, messageText);
                    return true;
                  }else if (messageText === '担保开启' || messageText === '担保刷新') {
                    let group = await cache.hget('group', chatId);
                    group = JSON.parse(JSON.parse(group));
                    group.guaranteeOpenTime = DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss');
                    await post('/bot/group/editGroup', group);
                    await sendMessage(chatId, messageId, messageText);
                    return true;
                  }else if (messageText === '担保关闭') {
                    let group = await cache.hget('group', chatId);
                    group = JSON.parse(JSON.parse(group));
                    if (!msg.chat.title.includes('已退押')) {
                      group.groupName = msg.chat.title.split('已押')[0] + '已退押';
                    }
                    group.groupWelcome = '';
                    group.groupBoss = '';
                    group.groupSalesman = '';
                    group.guaranteeCloseTime = DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss');
                    await post('/bot/group/editGroup', group);
                    await bot.setChatTitle(chatId, group.groupName);
                    await bot.setChatDescription(chatId, '-');
                    await bot.setChatDescription(chatId, '');

                    // 获取群组管理员信息并下掉非官方管理
                    await bot.getChatAdministrators(chatId)
                      .then(async (admins) => {
                        for (let admin of admins) {
                          if (admin.status !== 'creator') {
                            let exists = await cache.exists('admin:' + admin.user.id);
                            if (!exists) {
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
                        }
                      })
                      .catch((error) => {
                        console.error('Error fetching administrators:', error);
                      });

                    cache.hgetall('pin:' + chatId).then(async map => {
                      for (let key of Object.keys(map)) {
                        await bot.unpinChatMessage(chatId, {
                          message_id: key
                        }).catch((error) => {
                          console.error('Error unpinChatMessage:', error);
                        });
                      }
                      cache.del('pin:' + chatId);
                    }).then(async () => {
                      let value = await cache.get('promote:' + messageText);
                      value = JSON.parse(JSON.parse(value)).content.split('--分隔符--');
                      await bot.sendMessage(chatId, value[0], {
                        reply_to_message_id: messageId,
                      });
                      let message = await bot.sendMessage(chatId, value[1]);
                      await bot.pinChatMessage(chatId, message.message_id);
                    });
                    return true;
                  }else if (messageText === '开启权限') {
                    await bot.sendMessage(chatId, '您已经是管理，请勿重复执行命令', {
                      reply_to_message_id: messageId,
                    });
                    return true;
                  }
                }
              }
            } else if (admin && msg.caption === '设置公群头像' && msg.photo) {
              // 使用setChatPhoto方法设置群头像，传入最后一张最大尺寸的图片photoStream作为photo参数
              bot.setChatPhoto(chatId, bot.getFileStream(msg.photo.pop().file_id)).catch((error) => {
                console.error('设置群头像失败：', error);
              });
            }
          }else if (admin) {
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
              return true;
            }
          }
        }
      } else {
        if (messageText === '/start') {
          await bot.sendMessage(chatId, '这里是光辉C圈机器人\n' +
            '愿三叉星辉照亮你的事业与前程');
          return true;
        }else if (messageText && /^\d+$/.test(messageText)) {
          await post('/bot/group/groupList', { groupName: '公群' + messageText + ' ' }).then(async (data) => {
            if (data.data.total > 0) {
              await bot.sendMessage(chatId, data.data.rows[0].groupUrl, {
                reply_to_message_id: messageId,
              });
            }
          });
          return true;
        }else if (messageText) {
          let pageSize = 20;
          let pageNum = 1;
          await post('/bot/group/groupList', { params: {pageSize: pageSize, pageNum: pageNum}, groupName: NodeJieba.cut(messageText, true).join(',') }).then(async (data) => {
            if (data.data.total > 0) {
              let totalPage = Math.ceil(data.data.total / pageSize);
              let inline_keyboard = [[], []];
              for (let i = 1; i <= totalPage; i++) {
                if (i === 1) {
                  inline_keyboard[0].push({ text: '(1)', callback_data: '1' });
                }else if (i === totalPage && i > 1) {
                  inline_keyboard[0].push({ text: `${i}`, callback_data: `${i}` });
                  inline_keyboard[0].push({ text: '尾页', callback_data: `${i}` });
                }else {
                  inline_keyboard[0].push({ text: `${i}`, callback_data: `${i}` });
                }
              }
              if (totalPage > 1) {
                inline_keyboard[1].push({ text: `下一页➡️`, callback_data: `2` });
              }
              await bot.sendMessage(chatId, Array.from(data.data.rows.entries()).map(([index, group]) => `${index + 1 + pageSize * (pageNum - 1)}. [${group.groupName}](${group.groupUrl})`).join('\n') + `\n\n第 ${pageNum} 页，共 ${totalPage} 页`, {
                reply_to_message_id: messageId,
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                reply_markup: {
                  inline_keyboard: inline_keyboard
                }
              });
            }
          });
          return true;
        }
      }
    } catch (error) {
      console.error(error);
      return false;
    }
  }
});

bot.on('callback_query', async (msg) => {
  if (msg.data && msg.data !== '0') {
    let pageSize = 20;
    let pageNum = Number(msg.data);
    await post('/bot/group/groupList', { params: {pageSize: pageSize, pageNum: pageNum}, groupName: NodeJieba.cut(msg.message.reply_to_message.text, true).join(',') }).then(async (data) => {
      if (data.data.total > 0) {
        let totalPage = Math.ceil(data.data.total / pageSize);
        let inline_keyboard = [[], []];
        for (let i = 1; i <= totalPage; i++) {
          if (i === 1 && i !== pageNum && totalPage > 1) {
            inline_keyboard[0].push({ text: '首页', callback_data: '1' });
          }
          if (i === pageNum) {
            inline_keyboard[0].push({ text: `(${i})`, callback_data: `${i}` });
          }else {
            inline_keyboard[0].push({ text: `${i}`, callback_data: `${i}` });
          }
          if (i === totalPage && i !== pageNum && totalPage > 1) {
            inline_keyboard[0].push({ text: '尾页', callback_data: `${i}` });
          }
        }
        if (totalPage > 1) {
          if (pageNum !== 1) {
            inline_keyboard[1].push({ text: `上一页⬅️`, callback_data: `${pageNum - 1}` });
          }
          if (pageNum !== totalPage) {
            inline_keyboard[1].push({ text: `下一页➡️`, callback_data: `${pageNum + 1}` });
          }
        }
        // 修改消息文本
        await bot.editMessageText(Array.from(data.data.rows.entries()).map(([index, group]) => `${index + 1 + pageSize * (pageNum - 1)}. [${group.groupName}](${group.groupUrl})`).join('\n') + `\n\n第 ${pageNum} 页，共 ${totalPage} 页`, {
          chat_id: msg.message.chat.id,
          message_id: msg.message.message_id,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        });
        // 修改消息按钮
        await bot.editMessageReplyMarkup({
          inline_keyboard: inline_keyboard
        }, {
          chat_id: msg.message.chat.id,
          message_id: msg.message.message_id
        });
      }
    });
  }
});