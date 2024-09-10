import TelegramBot from 'node-telegram-bot-api';
import Redis from 'ioredis';

// redis缓存
const host = '127.0.0.1';
const cache = new Redis({
  host: host,
  port: 6380,
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

const token = '6755005381:AAEFiThX6x56t90TtWxYpwNU-J9JI-dpS1Y';

const bot = new TelegramBot(token, {
  polling: true,
  request: {
    agentOptions: {
      keepAlive: true,
      family: 4
    }
  }
});

// 设置聊天菜单按钮
/* const menuButton = {
  type: 'commands',
  text: '菜单',
  commands: [{ command: 'start', description: '开始' }]
};
bot.setChatMenuButton(menuButton);
bot.setMyCommands([{ command: 'start', description: '开始' }]); */

// 获取随机空闲客服
async function getRandomStaff(biz) {
  const staffIds = await cache.smembers(`idleStaff:${biz}`);
  if (staffIds.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * staffIds.length);
  cache.srem(`idleStaff:${biz}`, staffIds[randomIndex])
    .catch(err => {
      console.error('idleStaff删除元素失败', err);
    });
  return staffIds[randomIndex];
}

// 分配客服
async function assignStaff(chatId, biz) {
  const staffId = await getRandomStaff(biz);
  if (!staffId) {
    await bot.sendMessage(chatId, '目前该业务没有空闲客服，请稍后再试。');
  }else {
    let pipeline = cache.pipeline();
    await cache.hset(`customer:${chatId}`, 'staff', staffId);
    await cache.hset(`customer:${chatId}`, 'biz', biz);
    await cache.hset(`staff:${staffId}`, 'customer', chatId);
    await cache.hset(`staff:${staffId}`, 'biz', biz);
    await pipeline.exec((error, replies) => {
      if (error) {
        console.error('pipeline error:' + error);
      }
    }).then(async () => {
      await bot.sendMessage(chatId, '正在分配人工坐席客服，请耐心等候...\n等待期间，可以将您需要办理的业务内容进行描述，待分配到人工客服后直接回复您🤗');
    });
    return staffId;
  }
}

// 转发消息
async function forwardMessage(msg, biz) {
  const chatId = msg.chat.id;
  const customer = await cache.hgetall(`customer:${chatId}`);
  if (customer.staff && customer.biz === biz) {
    await bot.sendMessage(chatId, `${biz}已有人工坐席客服，在和您对接...`);
  }else if (customer.staff) {
    // await bot.sendMessage(chatId, `${customer.biz}已有人工坐席客服，在和您对接...`);
/*     let pipeline = cache.pipeline();
    await pipeline.hdel(`staff:${customer.staff}`, 'customer');
    await pipeline.del(`customer:${chatId}`);
    await pipeline.del(`staffMessages:${customer.staff}`);
    await pipeline.del(`customerMessages:${chatId}`);
    await pipeline.sadd(`idleStaff:${customer.biz}`, customer.staff);
    await pipeline.exec((error, replies) => {
      if (error) {
        console.error('pipeline error:' + error);
      }
    }).then(async () => {
      await assignStaff(chatId, biz, staffId).then(async () => {
        await bot.forwardMessage(staffId, chatId, msg.message_id);
      });
    }); */
  }else {
    await assignStaff(chatId, biz).then(async (staffId) => {
      if (staffId) {
        await bot.forwardMessage(staffId, chatId, msg.message_id);
      }
    });
  }
}

bot.on('callback_query', async (msg) => {
  const chatId = msg.message.chat.id;
  let data = msg.data;
  if (data === '结束对话') {
    let staff = await cache.hgetall(`staff:${chatId}`);
    // 客服结束聊天
    if (staff.customer) {
      await bot.sendMessage(staff.customer, '客服已结束聊天，感谢您的使用，请您对本次服务做出评价。', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '3分', callback_data: '3分' },
              { text: '5分', callback_data: '5分' },
              { text: '10分', callback_data: '10分' },
            ]
          ]
        }
      });
    }else {
      await bot.sendMessage(chatId, `您目前没有正在对话的客户。`);
    }
  }else if (data === '3分' || data === '5分' || data === '10分') {
    let customer = await cache.hgetall(`customer:${chatId}`);
    // 客服结束聊天
    if (customer.staff) {
      await bot.sendMessage(chatId, `感谢您对本次服务做出的宝贵评价。`);
      await bot.sendMessage(customer.staff, `客户对本次服务做出${data}评价。`);
      let pipeline = cache.pipeline();
      await pipeline.hdel(`staff:${customer.staff}`, 'customer', 'biz');
      await pipeline.hdel(`customerLastMessage`, chatId);
      await pipeline.del(`customer:${chatId}`);
      await pipeline.del(`staffMessages:${customer.staff}`);
      await pipeline.del(`customerMessages:${chatId}`);
      await pipeline.sadd(`idleStaff:${customer.biz}`, customer.staff);
      await pipeline.exec((error, replies) => {
        if (error) {
          console.error('pipeline error:' + error);
        }
      });
    }
  }else if (data === '转接客服') {
    await bot.sendMessage(chatId, '请选择你需要转接的客服坐席：', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '拉专群', callback_data: '转接拉专群' },
            { text: '开公群', callback_data: '转接开公群' },
            { text: '纠纷仲裁', callback_data: '转接纠纷仲裁' },
            { text: '投诉与建议', callback_data: '转接投诉与建议' },
            { text: '买广告解封', callback_data: '转接买广告解封' }
          ]
        ]
      }
    });
  }else if (data === '转接拉专群' || data === '转接开公群' || data === '转接纠纷仲裁' || data === '转接投诉与建议' || data === '转接买广告解封') {
    cache.exists(`idleStaff:${data.substring(2)}`).then(async (exists) => {
      if (exists) {
        let staff = await cache.hgetall(`staff:${chatId}`);
        if (staff.customer) {
          let pipeline = cache.pipeline();
          await pipeline.hdel(`staff:${chatId}`, 'customer', 'biz');
          await pipeline.del(`staffMessages:${chatId}`);
          await pipeline.del(`customerMessages:${staff.customer}`);
          await pipeline.sadd(`idleStaff:${staff.biz}`, chatId);
          await pipeline.exec((error, replies) => {
            if (error) {
              console.error('pipeline error:' + error);
            }
          }).then(async () => {
            data = data.substring(2);
            await assignStaff(staff.customer, data).then(async (staffId) => {
              if (staffId) {
                await bot.sendMessage(chatId, `已转接 ${data}客服。`);
                await bot.sendMessage(staff.customer, `已转接 ${data}客服。`);
                await bot.sendMessage(staffId, `${data}客服已将客户转接给您。`);
              }
            });
          });
        }else {
          await bot.sendMessage(chatId, `您目前没有客户需要转接。`);
        }
      } else {
        await bot.sendMessage(chatId, `该业务没有空闲客服，无法转接。`);
        return true;
      }
    });
  }else if (data === '拉专群' || data === '开公群' || data === '纠纷仲裁' || data === '投诉与建议' || data === '买广告解封') {
    let exists = await cache.exists(`staff:${chatId}`) || cache.sismember(`idleStaff:${data}`, chatId) === 1;
    if (!exists) {
      // 用户选择业务板块
      let pipeline = cache.pipeline();
      await pipeline.hset(`staff:${chatId}`, 'service', data);
      await pipeline.hset(`staff:${chatId}`, 'chatId', chatId);
      await pipeline.hset(`staff:${chatId}`, 'username', msg.from.username);
      await pipeline.hset(`staff:${chatId}`, 'firstName', msg.from.first_name);
      await pipeline.sadd(`idleStaff:${data}`, chatId);
      await pipeline.exec((error, replies) => {
        if (error) {
          console.error('pipeline error:' + error);
        }
      }).then(async () => {
        await bot.sendMessage(chatId, '感谢您的选择！您已加入空闲客服列表。');
      });
    }else {
      await bot.sendMessage(chatId, '您已经是客服人员了，请勿重复申请');
    }
  }
  // 编辑消息，删除内联键盘
  await bot.editMessageReplyMarkup({}, {
    chat_id: chatId,
    message_id: msg.message.message_id
  });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === 'bangdingbot') {
    await bot.sendMessage(chatId, '请选择你需要绑定的客服坐席：', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '拉专群', callback_data: '拉专群' },
            { text: '开公群', callback_data: '开公群' },
            { text: '纠纷仲裁', callback_data: '纠纷仲裁' },
            { text: '投诉与建议', callback_data: '投诉与建议' },
            { text: '买广告解封', callback_data: '买广告解封' }
          ]
        ]
      }
    });
  } else if (text === '/start') {
    await bot.sendMessage(chatId, '您好，这里是欧意担保24小时在线人工客服，请问有什么可以帮助您的？🥳', {
      reply_markup: {
        keyboard: [
          ['拉专群', '开公群'],
          ['纠纷仲裁', '投诉与建议'],
          ['买广告解封']
        ],
        resize_keyboard: true // Adjust keyboard size to fit the screen
      }
    });
  } else if (text === '拉专群' || text === '开公群' || text === '纠纷仲裁' || text === '投诉与建议' || text === '买广告解封') {
    await cache.exists(`staff:${chatId}`).then(async (exists) => {
      if (!exists) {
        await forwardMessage(msg, text);
      }
    });
  } else if (text) {
    let staff = await cache.hgetall(`staff:${chatId}`);
    if (staff.chatId) {
      if (text === 'quxiaobangdingbot') {
        let pipeline = cache.pipeline();
        await pipeline.del(`staff:${chatId}`);
        await pipeline.del(`staffMessages:${chatId}`);
        if (staff.customer) {
          await pipeline.del(`customer:${staff.customer}`);
          await pipeline.del(`customerMessages:${staff.customer}`);
        }
        await pipeline.srem(`idleStaff:${staff.service}`, chatId);
        await pipeline.exec((error, replies) => {
          if (error) {
            console.error('pipeline error:' + error);
          }
        }).then(async () => {
          await bot.sendMessage(chatId, `您已与${staff.service === '拉专群' || staff.service === '开公群' ? staff.service.substring(1) : staff.service}客服脱离！感谢您今天一天辛勤的工作！致敬每位辛苦的客服😇`, {
            reply_to_message_id: msg.message_id,
          });
        });
      } else if (text === 'chakanbot' && staff.service) {
        await bot.sendMessage(chatId, `您所在的岗位是${staff.service === '拉专群' || staff.service === '开公群' ? staff.service.substring(1) : staff.service}客服！`, {
          reply_to_message_id: msg.message_id,
        });
      } else if (staff.customer) {
        if (text === '结束') {
          // 客服结束聊天
          if (staff.customer) {
            await bot.sendMessage(staff.customer, '客服已结束聊天，感谢您的使用，请您对本次服务做出评价。', {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '3分', callback_data: '3分' },
                    { text: '5分', callback_data: '5分' },
                    { text: '10分', callback_data: '10分' },
                  ]
                ]
              }
            });
            /*           let pipeline = cache.pipeline();
                      await pipeline.hdel(`staff:${chatId}`, 'customer', 'biz');
                      await pipeline.del(`customer:${staff.customer}`);
                      await pipeline.del(`staffMessages:${chatId}`);
                      await pipeline.del(`customerMessages:${staff.customer}`);
                      await pipeline.sadd(`idleStaff:${staff.biz}`, chatId);
                      await pipeline.exec((error, replies) => {
                        if (error) {
                          console.error('pipeline error:' + error);
                        }
                      }); */
          }
        }else {
          // 客服回复，转发给用户
          let message;
          if (msg.reply_to_message) {
            let messageId = await cache.hget(`customerMessages:${staff.customer}`, msg.reply_to_message.message_id);
            message = await bot.sendMessage(staff.customer, `*${staff.biz}客服*：\n` + text, {
              reply_to_message_id: messageId,
              parse_mode: 'Markdown',
            });
          }else {
            message = await bot.sendMessage(staff.customer, `*${staff.biz}客服*：\n` + text, {
              parse_mode: 'Markdown',
            });
          }
          await cache.hset(`staffMessages:${chatId}`, message.message_id, msg.message_id);
          await cache.hset(`customerMessages:${staff.customer}`, msg.message_id, message.message_id);
        }
      }
    } else {
      let customer = await cache.hgetall(`customer:${chatId}`);
      if (customer.staff) {
        // 用户回复，转发给客服
        let message;
        if (msg.reply_to_message) {
          let messageId = await cache.hget(`staffMessages:${customer.staff}`, msg.reply_to_message.message_id);
          message = await bot.sendMessage(customer.staff, 'tgid：'+msg.from.id+'\n用户名：@'+msg.from.username+' '+msg.from.first_name+'\n\n信息：' + text, {
            reply_to_message_id: messageId,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '转接客服', callback_data: '转接客服' },
                  { text: '结束对话', callback_data: '结束对话' },
                ]
              ]
            }
          });
        }else {
          message = await bot.sendMessage(customer.staff, 'tgid：'+msg.from.id+'\n用户名：@'+msg.from.username+' '+msg.from.first_name+'\n\n信息：' + text, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '转接客服', callback_data: '转接客服' },
                  { text: '结束对话', callback_data: '结束对话' },
                ]
              ]
            }
          });
        }
        await cache.hset(`staffMessages:${customer.staff}`, msg.message_id, message.message_id);
        await cache.hset(`customerMessages:${chatId}`, message.message_id, msg.message_id);
        await cache.hset('customerLastMessage', chatId, Date.now());
      }
    }
  } else if (msg.pinned_message) {
    let staff = await cache.hgetall(`staff:${chatId}`);
    if (staff.customer) {
      // 客服置顶后将消息id转为客户方消息id并置顶
      await cache.hget(`customerMessages:${staff.customer}`, msg.pinned_message.message_id).then(async messageId => {
        if (messageId) {
          await bot.pinChatMessage(staff.customer, messageId);
        }
      });
    } else {
      let customer = await cache.hgetall(`customer:${chatId}`);
      if (customer.staff) {
        // 客户置顶后将消息id转为客服方消息id并置顶
        await cache.hget(`staffMessages:${customer.staff}`, msg.pinned_message.message_id).then(async messageId => {
          if (messageId) {
            await bot.pinChatMessage(customer.staff, messageId);
          }
        });
        await cache.hset('customerLastMessage', chatId, Date.now());
      }
    }
  }
});

setInterval(async () => {
  await cache.hgetall('customerLastMessage').then(async (customerLastMessage) => {
    if (customerLastMessage) {
      for (let key of Object.keys(customerLastMessage)) {
        if (Date.now() - customerLastMessage[key] > 1200000) {
          await bot.sendMessage(key, '由于您长时间未操作，客服服务已超时中止，感谢您的使用。');
          let customer = await cache.hgetall(`customer:${key}`);
          if (customer.biz) {
            let pipeline = cache.pipeline();
            await pipeline.hdel(`staff:${customer.staff}`, 'customer', 'biz');
            await pipeline.del(`staffMessages:${customer.staff}`);
            if (customer.staff) {
              await bot.sendMessage(customer.staff, '由于客户长时间未操作，客服服务已超时中止，评价默认为10分');
              await pipeline.del(`customer:${key}`);
              await pipeline.del(`customerMessages:${key}`);
              await pipeline.hdel(`customerLastMessage`, key);
              await pipeline.sadd(`idleStaff:${customer.biz}`, customer.staff);
            }
            await pipeline.exec((error, replies) => {
              if (error) {
                console.error('pipeline error:' + error);
              }
            })
          }
        }
      }
    }
  });
}, 600000);
