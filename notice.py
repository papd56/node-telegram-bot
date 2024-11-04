import telebot
import time

# 替换为你的 Bot Token  notice8897bot
BOT_TOKEN = '7829636771:AAGpnFhb8wpA1oEPHEzXBudxMoAMUZOP2ng'

bot = telebot.TeleBot(BOT_TOKEN)

# 要发送的消息
message = "神奇猫猫全球同步钓鱼网站出租 包裹，网银，积分，电商支付插件。承接私人定制玩法保密你知我知支持各大担保上押，支持先做后付 👍 价格天66u 周450u月 永久1800u包含服务器域名搭建。 合作联系：@xiaoshi889766"

# 用户 ID 或群组 ID 列表
user_ids = [-1002199875824 ,7445077710 ,6884995168 ,-1002160373359]

# 发送消息
def send_message(user_id, message):
    try:
        bot.send_message(user_id, message)
    except Exception as e:
        print(f"发送消息出错: {e}")

while True:
    try:
        for user_id in user_ids:
            send_message(user_id, message)
            print(f"消息发送给 {user_id}")
    except Exception as e:
        print(f"发送消息出错: {e}")
    time.sleep(10)

# 开启轮询（一般不需要）
bot.polling()
