import TelegramBot from 'node-telegram-bot-api';
import Redis from 'ioredis';
import http from 'http';

// redis缓存
const cache = new Redis({
  host: '47.76.223.250',
  port: 6379
});

function fetchData(path) {
  return new Promise((resolve, reject) => {
    let options = {
      hostname: 'localhost',
      port: 8897,
      path: path,
      method: 'POST'
    };
    let req = http.request(options, (res) => {});
    req.on('error', (error) => {
      reject(error);
    });
    req.end();
  });
}
async function main() {
  try {
    const userList = await fetchData('/bot/user/userList');
    const promoteList = await fetchData('/bot/promote/promoteList');
  } catch (error) {
    console.error(error);
  }
}
main();

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

// Listen for new chat members
bot.on('new_chat_members', (msg) => {
  console.log(msg);
  const newMembers = msg.new_chat_members;
  newMembers.forEach(member => {
    bot.sendMessage(chatId, cache.get("promote:群组欢迎语").content.replace("X",member.first_name));
  });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageText = msg.text;
  const messageId = msg.message_id; //获取消息ID
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
        await bot.sendMessage(chatId, cache.get("promote:验群").content, {
          reply_to_message_id: messageId,
        });
      }
      let isAdmin = await checkifUserIsAdmin(bot, msg);
      if (messageText && (isAdmin === 1 || cache.has("admin:"+userId))) {
        if (messageText.startsWith('修改公群名')) {
          // 更改群组名称
          await bot.setChatTitle(chatId, messageText.substring(5));
          await bot.sendMessage(chatId, cache.get("promote:修改公群名").content, { reply_to_message_id: messageId });
        }

        if (messageText === '真公群') {
          //真公群  发送消息 发送图片
          await bot.setChatPermissions(chatId, newPermissions);
          await bot.sendMessage(chatId, cache.get("promote:真公群").content, {
            reply_to_message_id: messageId,
          });
        }

        if (messageText === '上课') {
          //群已开  发送消息 发送图片
          await bot.setChatPermissions(chatId, newPermissions);
          await bot.sendMessage(chatId, cache.get("promote:上课").content, {
            reply_to_message_id: messageId,
          });
        }

        if (messageText === '下课') {
          //设置全员禁言
          await bot.setChatPermissions(chatId, { can_send_messages: false });
          await bot.sendMessage(chatId, cache.get("promote:下课").content, {
            reply_to_message_id: messageId,
          });
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
          // 发送置顶提醒
          if (messageText.startsWith('设置群老板 @')) {
            await bot.sendMessage(chatId, cache.get("promote:设置群老板").content, { reply_to_message_id: messageId });
          } else {
            await bot.sendMessage(chatId, cache.get("promote:设置群业务员").content, { reply_to_message_id: messageId });
          }
        }

        if (messageText.startsWith('踢出 @') || messageText.startsWith('踢出 @')) {
          const username = msg.text.split('@')[1];
          await bot.banChatMember(chatId, cache.get("user:"+username).userId, {});
          // 发送踢出提醒
          await bot.sendMessage(chatId, cache.get("promote:踢出").content, {
            reply_to_message_id: messageId
          });
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
            // 发送置顶提醒
            if (messageText === '设置群老板') {
              await bot.sendMessage(chatId, cache.get("promote:设置群老板").content, { reply_to_message_id: messageId });
            } else {
              await bot.sendMessage(chatId, cache.get("promote:设置群业务员").content, { reply_to_message_id: messageId });
            }
          }

          if (messageText === '开启权限') {
            await bot.promoteChatMember(chatId, userId, {
              can_change_info: true,        // 修改群组信息
              can_delete_messages: true,    // 删除信息
              can_restrict_members: true,   // 封禁成员
              can_invite_users: true,       // 添加成员
              can_pin_messages: true,       // 置顶消息
              can_promote_members: true     // 添加管理员
            });
            await bot.sendMessage(chatId, cache.get("promote:开启权限").content, {
              reply_to_message_id: messageId,
            });
          }

          if (messageText === '置顶') {
            await bot.pinChatMessage(chatId, replyMessageId, {});
            // 发送置顶提醒
            await bot.sendMessage(chatId, cache.get("promote:置顶").content, {
              reply_to_message_id: messageId
            });
          }

          if (messageText === '取消置顶') {
            await bot.unpinChatMessage(chatId, {
              message_id: replyMessageId
            });
            // 发送取消置顶提醒
            await bot.sendMessage(chatId, cache.get("promote:取消置顶").content, {
              reply_to_message_id: messageId
            });
          }

          if (messageText === '踢出') {
            await bot.banChatMember(chatId, replyUserId, {});
            // 发送踢出提醒
            await bot.sendMessage(chatId, cache.get("promote:踢出").content, {
              reply_to_message_id: messageId
            });
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
});
