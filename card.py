from selenium import webdriver
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

# 创建WebDriver实例
options = webdriver.ChromeOptions()
options.add_argument('--headless')  # 无头模式
options.add_argument('--disable-gpu')  # 禁用 GPU

# 创建 WebDriver 实例
# noinspection PyTypeChecker

driver = webdriver.Chrome(ChromeDriverManager().install(), options)
# 获取浏览器名称
browser_name = driver.capabilities['browserName']
# driver = webdriver.Chrome(ChromeDriverManager().install())

# 打开网页
driver.get("https://pay.izettle.com/?88XYD882m")  # 替换为实际的网址

# 定位输入框并输入信息
card_number_field = driver.find_element(By.ID, "card_number")  # 替换为实际的id
card_number_field.send_keys("4165490176405179")

# 其他输入框同理，例如：
card_expiry_month = driver.find_element(By.ID, "expiry_month")
card_expiry_month.send_keys("12")

# 其他输入框同理，例如：
card_expiry_month = driver.find_element(By.ID, "CVV")
card_expiry_month.send_keys("123")

# 找到并点击提交按钮
submit_button = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
submit_button.click()

# 关闭浏览器
driver.quit()
