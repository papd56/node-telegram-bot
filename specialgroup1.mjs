import TelegramBot from 'node-telegram-bot-api';
import Redis from 'ioredis';
import checkifUserIsAdmin from './adminCheck.mjs';

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

const token = '7238618014:AAGnBCYYVzuiMC0wkAU-9OhaUL-zGmZtHHA';

const bot = new TelegramBot(token, {
  polling: true,
  request: {
    agentOptions: {
      keepAlive: true,
      family: 4
    }
  }
});

async function sendMessage(chatId, messageId, messageText) {
  let value = await cache.get('promote:' + messageText);
  await bot.sendMessage(chatId, JSON.parse(JSON.parse(value)).content);
}

// Listen for new chat members
bot.on('new_chat_members', async (msg) => {
  if (msg) {
    const chatId = msg.chat.id;
    const newMembers = msg.new_chat_members;
    let pipeline = cache.pipeline();
    for (let member of newMembers) {
      const welcomeMessage = `欢迎 **${member.first_name}** 进群, tgid *${member.id}*, tg注册时间为2021-11-10后`;
      await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
      pipeline.set('deal:' + chatId + '_' + member.username, member.first_name);
    }
    await pipeline.exec((error, replies) => {
      if (error) {
        console.error('pipeline error:' + error);
      }
    });
  }
});

// 设置权限 (允许发送消息和图片)
const newPermissions = {
  can_send_messages: true,
  can_send_photos: true,
  // ...其他权限设置
};

// 存储确认状态
const confirmationStatus = {
  supplier: false, // 供方负责人是否已确认
  demander: false, // 需方负责人是否已确认
};

bot.on('message', async (msg) => {
  if (msg) {
    const chatId = msg.chat.id;
    let title = msg.chat.title;
    const messageId = msg.message_id; //获取消息ID
    const userId = msg.from.id;
    let messageText = msg.text === undefined ? '' : msg.text.trim();
    const replyMessage = msg.reply_to_message;
    let replyMessageId = messageId;
    let replyUserId = userId;
    if (replyMessage) {
      replyMessageId = replyMessage.message_id; //获取回复消息ID
      replyUserId = replyMessage.from.id; //获取回复用户ID
    }

    try {
      // 检查消息是否来自群组
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        if (messageText === '请双方负责人确认') {
          //需方负责人
          let supply = await cache.get('supply:' + chatId);
          //供方负责人
          let demand = await cache.get('demand:' + chatId);
          const buttons = {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ 供方确认', callback_data: 'confirm_supplier' },
                  { text: '✅ 需方确认', callback_data: 'confirm_demander' },
                ],
              ],
            },
          };
          const message = `
请双方负责人确认：（双方负责人点击有效，其他人无效）
确认无误后点击下方确认按钮：
供方负责人: ${supply} ${confirmationStatus.supplier ? '✅ 已确认' : ''}
需方负责人: ${demand} ${confirmationStatus.demander ? '✅ 已确认' : ''}
`;
          await bot.sendMessage(chatId, message, buttons);
        }
        if (messageText === '创建新链接1') {
          try {
            // 创建一个新的邀请链接
            const newInviteLink = await bot.createChatInviteLink(chatId, {
              name: '新邀请链接',
              member_limit: 1, // 限制最多10人使用
            });

            console.log('新的邀请链接:', newInviteLink.invite_link);
            bot.sendMessage(chatId, `创建专群链接成功！\n` + `新的邀请链接是：\n` + `${newInviteLink.invite_link}`, {
              disable_web_page_preview: true
            });
          } catch (error) {
            console.error('创建邀请链接时出错:', error);
            bot.sendMessage(chatId, '创建邀请链接失败，请检查权限或群组设置。');
          }
        }
        if (messageText === '创建新链接2') {
          try {
            // 创建一个新的邀请链接
            const newInviteLink = await bot.createChatInviteLink(chatId, {
              name: '新邀请链接',
              // expire_date: Math.floor(Date.now() / 1000) + 3600,
              member_limit: 2, // 限制最多10人使用
            });

            console.log('新的邀请链接:', newInviteLink.invite_link);
            bot.sendMessage(chatId, `创建专群链接成功！\n` + `新的邀请链接是：\n` + `${newInviteLink.invite_link}`, {
              disable_web_page_preview: true
            });
          } catch (error) {
            console.error('创建邀请链接时出错:', error);
            bot.sendMessage(chatId, '创建邀请链接失败，请检查权限或群组设置。');
          }
        }
        if (messageText === '锁群') {
          // 锁定群组的函数
          try {
            // 获取群组信息
            const chat = await bot.getChat(chatId);
            // 获取当前的邀请链接
            const currentInviteLinks = chat.invite_link || [];
            // 创建一个新的邀请链接
            const newInviteLink = await bot.exportChatInviteLink(chatId);
            // 删除旧的邀请链接
            for (const link of currentInviteLinks) {
              await bot.revokeChatInviteLink(chatId, link);
            }
            // 将新的邀请链接设置为主要的邀请链接
            await bot.setChatAdministratorCustomTitle(chatId, chat.id, {
              custom_title: '管理员',
              can_post_messages: false, // 根据需要设置其他权限
              can_edit_messages: false,
              can_delete_messages: false,
              can_invite_users: true,
              can_restrict_members: true,
              can_pin_messages: true,
              can_promote_members: true
            });
            await bot.sendMessage(chatId, '群组邀请链接已清除并更新', {
              reply_to_message_id: messageId,
            })
            console.log('群组邀请链接已清除并更新');
          } catch (error) {
            console.error('Error clearing invite links:', error);
          }
        }

        if (messageText === '验群' || messageText === '担保信息') {
          let admins = await bot.getChatAdministrators(chatId);
          await bot.sendMessage(chatId,
            `汇旺担保官方人员: ` +
            admins.map(admin => admin.user.username).join(' ') +
            ` 在本群，本群 《<code>${title}</code>》 是真群。`,
            {
              reply_to_message_id: messageId,
              parse_mode: 'HTML', // 启用 HTML 格式
            });
        }
        let isAdmin = await checkifUserIsAdmin(bot, msg);
        // let admin = await cache.exists('admin:' + userId);
        if (isAdmin) {
          if (replyMessage) {
            if (messageText === 'ID') {
              await bot.sendMessage(chatId, '该用户tgid: `' + replyUserId + '`', { parse_mode: 'Markdown' });
            } else if (messageText === '置顶') {
              await bot.pinChatMessage(chatId, replyMessageId);
              await bot.sendMessage(chatId, '置顶成功', {
                reply_to_message_id: messageId,
              });
            } else if (messageText === '设置需方') {
              await cache.set('demand:' + chatId, replyMessage.from.first_name + ' @' + replyMessage.from.username);
              await bot.sendMessage(chatId, '需方负责人设置完成');
            } else if (messageText === '设置供方') {
              await cache.set('supply:' + chatId, replyMessage.from.first_name + ' @' + replyMessage.from.username);
              await bot.sendMessage(chatId, '供方负责人设置完成');
            } else if (messageText === '设置需方人员') {
              await cache.hset('demands:' + chatId, replyMessage.from.username, replyMessage.from.first_name + ' @' + replyMessage.from.username);
              await bot.sendMessage(chatId, '需方人员设置完成');
            } else if (messageText === '设置供方人员') {
              await cache.hset('supplies:' + chatId, replyMessage.from.username, replyMessage.from.first_name + ' @' + replyMessage.from.username);
              await bot.sendMessage(chatId, '供方人员设置完成');
            } else if (messageText === '设置专群规则') {
              await cache.set('rule:' + chatId, replyMessage.text.trim());
              await bot.sendMessage(chatId, '规则设置成功');
            } else if (messageText === '设置专群业务') {
              await cache.set('biz:' + chatId, replyMessage.text.trim());
              await bot.sendMessage(chatId, '业务设置成功');
            }
          } else if (messageText === '初始化') {
            //专群初始化 发送消息 图片 视频 语音消息
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
            await bot.sendMessage(chatId, '初始化成功').then(async () => {
              await bot.sendMessage(chatId, '您好，请先描述一下具体交易内容跟规则，交易员稍后将汇总编辑成交易详情给交易双方确认，然后开始交易。\n' +
                '交易过程中为了避免不必要的纠纷，请按照我们的流程和步骤进行，感谢各位配合！\n' +
                '担保流程：@dbliucheng   \n' +
                '安全防范：@HuioneAQ\n' +
                '汇旺担保核心群  @daqun 还没加群的老板可以加一下，有什么不清楚的地方可以随时问本群交易员\n\n' +
                '⚠️进群后请认准群内官方人员的管理员身份，不是官方管理员身份发的上押地址，都是假冒的骗子，切勿相信！群内交易详情未确认，押金未核实到账，禁止交易，否则造成损失，自行承担责任，平台概不负责。\n\n' +
                '⚠️汇旺担保工作人员作息时间：🕙早上上班时间：北京时间9点！  🕙晚上下班时间：北京时间3点！\n\n' +
                '⚠️专群担保交易为一对一交易，所有交易记录需要在担保群内体现出来，禁止交易双方私下拉群交易，私下拉群交易不在本群担保范围内，特殊事项请联系本群交易员对接。\n\n' +
                '温馨提示：\n' +
                '1、交易方进交易群后，可以先上押再谈交易内容、规则。一个上押下押周期内，佣金不足20u的，以20u结算扣除手续费，上押前请交易双方务必斟酌好，是否已经协商交易内容规则。\n' +
                '2、即日起，凡是车队（跑分、代收代付）专群跑分类交易开群上押要求必须上押800u起，普通交易不限制最低上押金额。\n' +
                '3、请尽量使用冷钱包上押,不要用交易所直接提u上押,使用交易所提u上押的请上押时候说明是交易所提的u,并同时说明下押地址。\n' +
                '4、由于群资源紧张，如本群当天无上押，即被回收；后续如需交易，请联系 @hwdb 开新群。\n\n' +
                '⚠️请供需双方确定一下各方负责人，以后是否下押以及下押到哪，需要交易详情上的供需双方负责人确认，决定权在负责人手里，本群为私群，只能对应一个供方负责人和一个需方负责人。请不要拉无关人员进群，谁拉进来的人谁负责。人进齐后请通知交易员锁群').then(async () => {
                  let message = await bot.sendMessage(chatId, '初始化完成 该群是真群');
                  await cache.set('init:' + chatId, message.message_id + 1);
                });
            });
            await cache.set('rule:' + chatId, messageText.substring(6).trim());
          } else if (messageText === '显示所有人') {
            let supply = await cache.get('supply:' + chatId);
            let supplies = await cache.hvals('supplies:' + chatId);
            let demand = await cache.get('demand:' + chatId);
            let demands = await cache.hvals('demands:' + chatId);
            await bot.sendMessage(chatId, '供方负责人：' + demand + '\n供方人员：' + supplies + '\n需方负责人：' + supply + '\n需方人员：' + demands, {
              reply_to_message_id: messageId,
            });
          } else if (messageText === '显示专群群名') {
            await bot.sendMessage(chatId, title);
          } else if (messageText === '群组清理') {
            let message = await bot.sendMessage(chatId, messageText);
            let init = await cache.get('init:' + chatId);
            message = await bot.sendMessage(chatId, '检测本群目前存在' + (message.message_id - init - 1) + '条记录待清理,数据清理执行中(本条消息请忽略)');
            for (let i = init; i <= message.message_id; i++) {
              try {
                await bot.deleteMessage(chatId, i);
              } catch (error) {
                console.error(error);
              }
            }
            await bot.sendMessage(chatId, '群组清理完成');
            await cache.set('init:' + chatId, message.message_id + 1);
          } else if (messageText === '上押') {
            await bot.sendMessage(chatId, '上押汇旺账户：\n' +
              '汇旺账号：12345（靓号） 户名：担保上押 \n\n' +

              '上押TRC20地址：\n' +
              'TX36xRA9NVTP6oZsZYk98FYH25AoKVVter\n\n' +

              '请上押后立即@官方交易员  @hvvtb809 查账如有延迟通知查账，造成个人损失的，本平台概不负责押金未确认到帐  禁止交易   谨防骗子套路\n\n' +

              '上押请尽量用自己的冷钱包转账，上下押需同一地址，切勿使用交易所提币上押，否则后果自行承担】').then(async () => {
                await bot.sendPhoto(chatId, 'img.png').then(async () => {
                  await bot.sendMessage(chatId, 'TX36xRA9NVTP6oZsZYk98FYH25AoKVVter');
                });
              });
          } else if (messageText) {
            if (messageText.startsWith('设置专群群名') || messageText.startsWith('修改专群群名')) {
              // 更改群组名称
              let newTitle = messageText.substring(6).trim();
              await bot.setChatTitle(chatId, newTitle);
              await bot.sendMessage(chatId, '群名修改成功，请核对：\n老群名：' + title + '\n新群名：' + newTitle);
            } else if (messageText.startsWith('设置需方 @')) {
              let userName = messageText.split('@')[1].trim();
              let firstName = await cache.get('deal:' + chatId + '_' + userName);
              await cache.set('demand:' + chatId, firstName + ' @' + userName);
              await bot.sendMessage(chatId, '需方负责人设置完成');
            } else if (messageText.startsWith('设置供方 @')) {
              let userName = messageText.split('@')[1].trim();
              let firstName = await cache.get('deal:' + chatId + '_' + userName);
              await cache.set('supply:' + chatId, firstName + ' @' + userName);
              await bot.sendMessage(chatId, '供方负责人设置完成');
            } else if (messageText.startsWith('设置需方人员 @')) {
              let pipeline = cache.pipeline();
              let users = messageText.substring(8).split('@');
              for (let user of users) {
                let firstName = await cache.get('deal:' + chatId + '_' + user.trim());
                await cache.hset('demands:' + chatId, user.trim(), firstName + ' @' + user.trim());
              }
              await pipeline.exec(async (error, replies) => {
                if (error) {
                  console.error('pipeline error:' + error);
                } else {
                  await bot.sendMessage(chatId, '需方人员设置完成');
                }
              });
            } else if (messageText.startsWith('设置供方人员 @')) {
              let pipeline = cache.pipeline();
              let users = messageText.substring(8).split('@');
              for (let user of users) {
                let firstName = await cache.get('deal:' + chatId + '_' + user.trim());
                await cache.hset('supplies:' + chatId, user.trim(), firstName + ' @' + user.trim());
              }
              await pipeline.exec(async (error, replies) => {
                if (error) {
                  console.error('pipeline error:' + error);
                } else {
                  await bot.sendMessage(chatId, '供方人员设置完成');
                }
              });
            } else if (messageText.startsWith('设置专群规则')) {
              await cache.set('rule:' + chatId, messageText.substring(6).trim());
              await bot.sendMessage(chatId, '规则设置成功');
            } else if (messageText.startsWith('设置专群业务')) {
              await cache.set('biz:' + chatId, messageText.substring(6).trim());
              await bot.sendMessage(chatId, '业务设置成功');
            } else if (messageText.startsWith('查看交易详情')) {
              let demand = await cache.get('demand:' + chatId);
              let supply = await cache.get('supply:' + chatId);
              let rule = await cache.get('rule:' + chatId);
              let biz = await cache.get('biz:' + chatId);
              await bot.sendMessage(chatId, '交易详情：(请交易双方仔细阅读，确认后将按此标准执行) \n\n' +
                '需方 负责人：' + demand + '\n' +
                '供方 负责人：' + supply + '\n\n' +
                '交易规则：\n\n' + rule + '\n\n\n \n' +
                biz + '\n\n' +
                '重要提示： \n' +
                '1、请交易方控制好跑量，如跑量超出押金额度，出现资金风险，平台概不负责。 \n' +
                '2、本群为一对一交易群，严禁一个供方多个需方或一个需方多个供方，如发现本群出现一对多交易，罚款上押方1000U。 \n' +
                '3、本群只存在供需双方人员和汇旺工作人员，如某方所属人员拿钱跑路，所属方负责人自行承担责任。\n' +
                '4、USDT交易以实际到账usdt数量为准，USDT转出手续费和矿工费默认由usdt转出方承担。 \n' +
                '5、交易过程中买卖双方所有结算必须在汇旺担保官方群内，私下交易一律视为无效。供需双方需使用记账机器人记账，未记账且不报账单将按偷税漏税处罚。私下交易、偷税漏税将罚款5倍佣金，最低罚款1000u。\n' +
                '6、汇旺担保无法查证买U方rmb来源，请卖ｕ方自行核实，汇旺担保只能保障卖方拿到rmb，买方拿到u。请买u方勿将所购买的usdt用于非法用途。 \n' +
                '7、供需双方开始交易后，即默认同意此规则。如出现纠纷则按照汇旺担保纠纷处理原则处理 @dbliucheng  汇旺担保仲裁原则 @hwdbzc\n' +
                '8、严禁利用汇旺担保规则来恶意欺诈，欺瞒，诱导交易方，一经核实，无论结果如何，从重责罚。\n' +
                '9、新群若在当天未进行上押操作，将被回收。退押完毕的群如连续2天未重新上押交易，工作人员将进行清理回收。\n' +
                '请供需双方确认交易详情是否需要补充和修改，如确认无误请回复「确认交易」');
            } else if (messageText === '开启权限') {
              await bot.sendMessage(chatId, '您已经是管理，请勿重复执行命令', {
                reply_to_message_id: messageId,
              });
            }
          }
        } else {
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
          } else if (messageText === '上押') {
            await bot.sendMessage(chatId, '上押汇旺账户：\n' +
              '汇旺账号：12345（靓号） 户名：担保上押 \n\n' +

              '上押TRC20地址：\n' +
              'TX36xRA9NVTP6oZsZYk98FYH25AoKVVter\n\n' +

              '请上押后立即@官方交易员  @hvvtb809 查账如有延迟通知查账，造成个人损失的，本平台概不负责押金未确认到帐  禁止交易   谨防骗子套路\n\n' +
              '    【【上押请尽量用自己的冷钱包转账，上下押需同一地址，切勿使用交易所提币上押，否则后果自行承担】】。（上押请尽量用自己的冷钱包转账，上下押需同一地址）\n' +
              '上押请尽量用自己的冷钱包转账，上下押需同一地址，切勿使用交易所提币上押，否则后果自行承担】').then(async () => {
                await bot.sendPhoto(chatId, 'img.png').then(async () => {
                  await bot.sendMessage(chatId, 'TX36xRA9NVTP6oZsZYk98FYH25AoKVVter');
                });
              });
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

// 处理按钮点击
bot.on('callback_query', (callbackQuery) => {
  const data = callbackQuery.data; // 回调数据
  const message = callbackQuery.message; // 点击按钮时的消息
  const userId = callbackQuery.from.id; // 点击按钮的用户 ID

  let responseText = '';

  // 根据按钮类型更新状态
  if (data === 'confirm_supplier' && !confirmationStatus.supplier) {
    confirmationStatus.supplier = true;
    responseText = '供方负责人已确认 ✅';
  } else if (data === 'confirm_demander' && !confirmationStatus.demander) {
    confirmationStatus.demander = true;
    responseText = '需方负责人已确认 ✅';
  } else {
    responseText = '该操作已完成或无权限重复操作！';
  }

  // 更新消息内容
  const updatedText = `
请双方负责人确认：（双方负责人点击有效，其他人无效）
确认无误后点击下方确认按钮：
供方负责人: ${confirmationStatus.supplier ? '✅ 已确认' : ''}
需方负责人: ${confirmationStatus.demander ? '✅ 已确认' : ''}
`;

  // 修改原消息
  bot.editMessageText(updatedText, {
    chat_id: message.chat.id,
    message_id: message.message_id,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `✅ 供方确认${confirmationStatus.supplier ? '（已完成）' : ''}`,
            callback_data: 'confirm_supplier',
          },
          {
            text: `✅ 需方确认${confirmationStatus.demander ? '（已完成）' : ''}`,
            callback_data: 'confirm_demander',
          },
        ],
      ],
    },
  });

  // 回复点击者
  bot.answerCallbackQuery(callbackQuery.id, {
    text: responseText
  });
});
