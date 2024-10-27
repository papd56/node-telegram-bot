import telebot
import time

# 替换为你的 Bot Token  notice8897bot
BOT_TOKEN = '7829636771:AAGpnFhb8wpA1oEPHEzXBudxMoAMUZOP2ng'

bot = telebot.TeleBot(BOT_TOKEN)

# 要发送的消息
message = "金秋十月，神奇科比华丽上线了，欢迎大家咨询：@GPP331201, @xiaoshi889766"

# 用户 ID 或群组 ID 列表
user_ids = [-1002199875824, -1002456247839,7445077710 ,6884995168]

# 发送消息
for user_id in user_ids:
    try:
        bot.send_message(user_id, message)
        print(f"消息发送给 {user_id} 成功")
        time.sleep(1)  # 每次发送后延迟1秒
    except Exception as e:
        print(f"发送消息失败: {e}")

# 开启轮询（一般不需要）
bot.polling()
