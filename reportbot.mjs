import TelegramBot from 'node-telegram-bot-api';
import checkifUserIsAdmin from "./adminCheck.mjs"
const token = "7128410523:AAHVSQHAPXitivGxOqdr1StJaI7vY5zzvDY";
const bot = new TelegramBot(token, {
    polling: true,
});
// 假设 messages 是一个数组，用来存储最近的几条消息
let messages = [];

//交易方对接人
const transactionParty = "@hwdb"
bot.on("message", async (msg) => {
    // 将当前消息添加到缓存中
    messages.push(msg);

    // 如果缓存超过一定长度，移除最旧的消息
    if (messages.length > 10) {
        messages.shift();
    }

    // 获取上一条消息
    const previousMessage = messages[messages.length - 2];
    if (previousMessage) {
        // 使用上一条消息
        console.log("上一条消息:", previousMessage.text);
    }
    const chatId = msg.chat.id;
    const messageText = msg.text;
    const messageId = msg.message_id;
    const boostId = msg.from.id;

    try {
        if (messageText === "报备" || messageText === "报备模板") {
            const messageContent = "报备模板中必须包含: " + "\n" + "交易方对接人：@hwdb" + "\n" + "交易金额：100u" + "\n" + "订单完成时间：1天";
            bot.sendMessage(chatId, messageContent, {
            });
            bot.validateTradeInfo();
            return;
        }
        if (validateTradeInfo(messageText)) {
            bot.sendMessage(chatId, "发送成功，请在公群内查看", {
            });
            bot.telegram.sendMessage
        }
    } catch (error) {
        console.log("请求转发异常，报备失败！");

    }

});


//报备模板
function sendPymenTemplate(chatId,
    transactionAmount,
    transactionParty,
    orderFinshTime) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: "公群导航", url: "https://t.me/dbcksq" },
                // { text: "供求信息", url: "https://t.me/s/TelePlanting" },
                { text: "点击跳转完整账单", url: "https://acbot.top/?id=" + chatId },
            ],
        ],
    };

    const message = `<a href = "https://t.me/@Guik88">报备</a>
    <b>交易方对接人:</b>${transactionParty}
    <b>交易金额:</b>${transactionAmount}
    <b>订单完成时间:</b>${orderFinshTime}
    `;

    bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard,
        disable_web_page_preview: true,
    });

}

async function validateTradeInfo(text) {
    const regex = /交易方对接人：@hwdb.*交易金额：\d+(\.\d+)?[a-z]+.*订单完成时间：\d+[天|小时]/i;
    return regex.test(text);
}