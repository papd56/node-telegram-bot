import TelegramBot from 'node-telegram-bot-api';
import Redis from 'ioredis';

// redis缓存
const host = '8.217.124.68';
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

const token = '7130334331:AAHquum6IOQWikJLfaofZK3hc1Bt1o2rYIU';

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
    return;
  }
  let pipeline = cache.pipeline();
  await cache.hset(`customer:${chatId}`, 'staff', staffId);
  await cache.hset(`staff:${staffId}`, 'customer', chatId);
  await cache.hset(`staff:${staffId}`, 'biz', biz);
  await pipeline.exec((error, replies) => {
    if (error) {
      console.error('pipeline error:' + error);
    }
  });
}

// 转发消息
async function forwardMessage(msg, biz) {
  const chatId = msg.chat.id;
  const staffId = await cache.hget(`customer:${chatId}`, 'staff');
  if (staffId) {
    const biz = await cache.hget(`customer:${chatId}`, 'biz');
    await cache.sadd(`idleStaff:${biz}`, staffId);
  }
  await assignStaff(chatId, biz, staffId).then(async () => {
    await bot.forwardMessage(staffId, chatId, msg.message_id);
  });
}

bot.on('callback_query', async (msg) => {
  const chatId = msg.message.chat.id;
  const data = msg.data;
  // 用户选择业务板块
  let pipeline = cache.pipeline();
  await pipeline.hset(`staff:${chatId}`, 'chatId', chatId);
  await pipeline.hset(`staff:${chatId}`, 'username', msg.from.username);
  await pipeline.hset(`staff:${chatId}`, 'firstName', msg.from.first_name);
  await pipeline.sadd(`idleStaff:${data}`, chatId);
  await pipeline.exec((error, replies) => {
    if (error) {
      console.error('pipeline error:' + error);
    }
  });
  await bot.sendMessage(chatId, '感谢您的选择！您已加入空闲客服列表。');

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
    await bot.sendMessage(chatId, '正在分配人工坐席客服，请耐心等候...\n等待期间，可以将您需要办理的业务内容进行描述，待分配到人工客服后直接回复您🤗');
    await forwardMessage(msg, text);
  } else if (text) {
    let staff = await cache.hgetall(`staff:${chatId}`);
    if (staff.customer) {
      // 客服回复，转发给用户
      let message;
      if (msg.reply_to_message) {
        let messageId = await cache.hget(`customerMessages:${staff.customer}`, msg.reply_to_message.message_id);
        message = await bot.sendMessage(staff.customer, text, {
          reply_to_message_id: messageId
        });
      }else {
        message = await bot.sendMessage(staff.customer, text);
      }
      await cache.hset(`staffMessages:${chatId}`, message.message_id, msg.message_id);
      await cache.hset(`customerMessages:${staff.customer}`, msg.message_id, message.message_id);
    } else {
      let customer = await cache.hgetall(`customer:${chatId}`);
      if (customer.staff) {
        // 用户回复，转发给客服
        let message;
        if (msg.reply_to_message) {
          let messageId = await cache.hget(`staffMessages:${customer.staff}`, msg.reply_to_message.message_id);
          message = await bot.sendMessage(customer.staff, 'tgid：'+msg.from.username+' '+msg.from.first_name+'\n信息：' + text, {
            reply_to_message_id: messageId
          });
        }else {
          message = await bot.sendMessage(customer.staff, 'tgid：'+msg.from.username+' '+msg.from.first_name+'\n信息：' + text);
        }
        await cache.hset(`staffMessages:${customer.staff}`, msg.message_id, message.message_id);
        await cache.hset(`customerMessages:${chatId}`, message.message_id, msg.message_id);
      }
    }
  }
});
