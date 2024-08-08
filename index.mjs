import TelegramBot from 'node-telegram-bot-api';
const token = "7252814559:AAE46BxqQD8lkkvKz44ZDwVdizlgQVZIMGs";
import checkifUserIsAdmin from "./adminCheck.mjs"
const bot = new TelegramBot(token, {
    polling: true,
});

bot.on("message", async (msg) => {
    const chat_id = msg.chat.id;
    const user_id = msg.from.id;
    const messageText = msg.text;
    const orignalMessage = msg.message_id; //获取原始消息ID
    // 设置权限 (允许发送消息和媒体)
    const newPermissions = {
        can_send_messages: true,
        can_send_media_messages: true,
        // ...其他权限设置
    };

    try {
        if (messageText === "验群") {
            bot.sendMessage(chat_id, "本群是真群！请注意看我的用户名是 @Guik88 (群管拼音)，谨防假机器人。私聊我输入词语可以搜索真公群,如：卡商、白资、承兑等。请找有头衔的人在群内交易，切勿相信主动私聊你的，都是骗子。非群内交易没有任何保障.", {
                reply_to_message_id: orignalMessage,
            });
        }

    } catch (error) {
        console.log("获取信息出错", error);
    }

    try {
        if (messageText === "上课") {
            const isAdmin = await checkifUserIsAdmin(msg);
            if (isAdmin === 1) {
                //群已开  发送消息 发送媒体 
                bot.setChatPermissions(chat_id, newPermissions);
                bot.sendMessage(chat_id, "群已开，群内可以正常营业", {
                    reply_to_message_id: orignalMessage,


                });
            }
        }

        if (messageText === "置顶") {
            const isAdmin = await checkifUserIsAdmin(msg);
            if (isAdmin === 1) {
                // 置顶命令事件监听
                bot.onText(/\/pin (.+)/, async (msg, match) => {
                    const messageId = match[1];
                    console.log(messageId);
                    // 创建自定义键盘
                    const options = {
                        reply_markup: JSON.stringify({
                            inline_keyboard: [
                                [{ text: "置顶", callback_data: "pin" }]
                            ]
                        })
                    };
                    // 发送消息并提供自定义键盘
                    bot.pinChatMessage(chat_id, messageId, options);

                    // 发送置顶提醒
                    bot.sendMessage(chat_id, `置顶成功`, {
                        reply_to_message_id: messageId
                    });
                });

                // 处理用户输入"置顶"
                // bot.onText(/置顶/, async (msg, match) => {
                //     const messageIds = match[1];
                //     // 创建自定义键盘
                //     const options = {
                //         reply_markup: JSON.stringify({
                //             inline_keyboard: [
                //                 [{ text: "置顶", callback_data: "pin" }]
                //             ]
                //         })
                //     };
                //     console.log(messageIds);
                //     // 发送消息并提供自定义键盘
                //     bot.pinChatMessage(chat_id, messageIds, options);
                // });

                // // 处理回调查询
                // bot.on('callback_query', async (query) => {
                //     if (query.data === 'pin') {
                //         // 用户点击了“置顶”按钮
                //         await bot.answerCallbackQuery(query.id, { text: "请手动置顶消息。" });
                //     }
                // });

            } else {
                bot.sendMessage(chat_id, "只有管理员才能使用此命令。");
            }
        }

        if (messageText === "下课") {
            const isAdmin = await checkifUserIsAdmin(msg);
            if (isAdmin === 1) {
                //设置全员禁言
                bot.setChatPermissions(chat_id, { can_send_messages: false });
                bot.sendMessage(chat_id, "本公群今日已下课，如需交易，请在该群恢复营业后在群内交易！ 切勿私下交易！！！如有业务咨询请联系群老板/业务员如有纠纷请联系纠纷专员 @Guik88", {
                    reply_to_message_id: orignalMessage,
                });
            }
        }
    } catch (error) { }

});

