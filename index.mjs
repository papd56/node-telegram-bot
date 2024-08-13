import TelegramBot from 'node-telegram-bot-api';

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
        await bot.sendMessage(chatId, '本群是真群！请注意看我的用户名是 @Guik88 (群管拼音)，谨防假机器人。私聊我输入词语可以搜索真公群,如：卡商、白资、承兑等。请找有头衔的人在群内交易，切勿相信主动私聊你的，都是骗子。非群内交易没有任何保障.', {
          reply_to_message_id: messageId,
        });
      }
      let isAdmin = await checkifUserIsAdmin(bot, msg);
      if (messageText && isAdmin === 1) {
        if (messageText.startsWith('修改公群名')) {
          // 更改群组名称
          await bot.setChatTitle(chatId, messageText.substring(5));
          await bot.sendMessage(chatId, '修改成功', { reply_to_message_id: messageId });
        }

        if (messageText === '真公群') {
          //真公群  发送消息 发送图片
          await bot.setChatPermissions(chatId, newPermissions);
          await bot.sendMessage(chatId, '该公群为真公群！', {
            reply_to_message_id: messageId,
          });
        }

        if (messageText === '上课') {
          //群已开  发送消息 发送图片
          await bot.setChatPermissions(chatId, newPermissions);
          await bot.sendMessage(chatId, '群已开，群内可以正常营业', {
            reply_to_message_id: messageId,
          });
        }

        if (messageText === '下课') {
          //设置全员禁言
          await bot.setChatPermissions(chatId, { can_send_messages: false });
          await bot.sendMessage(chatId, '本公群今日已下课，如需交易，请在该群恢复营业后在群内交易！ 切勿私下交易！！！如有业务咨询请联系群老板/业务员如有纠纷请联系纠纷专员 @Guik88', {
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
            await bot.sendMessage(chatId, '设置群老板成功', { reply_to_message_id: messageId });
          } else {
            await bot.sendMessage(chatId, '设置群业务员成功', { reply_to_message_id: messageId });
          }
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
              await bot.sendMessage(chatId, '设置群老板成功', { reply_to_message_id: messageId });
            } else {
              await bot.sendMessage(chatId, '设置群业务员成功', { reply_to_message_id: messageId });
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
            await bot.sendMessage(chatId, '添加成功', {
              reply_to_message_id: messageId,
            });
          }

          if (messageText === '置顶') {
            await bot.pinChatMessage(chatId, replyMessageId, {});
            // 发送置顶提醒
            await bot.sendMessage(chatId, '置顶成功', {
              reply_to_message_id: messageId
            });
          }

          if (messageText === '取消置顶') {
            await bot.unpinChatMessage(chatId, {
              message_id: replyMessageId
            });
            // 发送取消置顶提醒
            await bot.sendMessage(chatId, '取消置顶成功', {
              reply_to_message_id: messageId
            });
          }
        }
      } else if (isAdmin === 0) {
        await bot.sendMessage(chatId, '只有管理员才能使用此命令。');
      }
    } else {
      await bot.sendMessage(chatId, '这个命令只能在群组中使用。');
    }
  } catch (error) {
    console.error(error);
    return false;
  }
});
