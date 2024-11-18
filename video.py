import requests
import ffmpeg

# 替换成你的 m3u8 文件 URL 和输出文件名
m3u8_url = "https://zyznygvideo.m6b3xt5.com/decry/vd/20241116/MDVlYTNkNmY/212607/1280_720/libx/hls/encrypt/index.m3u8"
output_file = "output.mp4"

def download_m3u8(m3u8_url, output_file):
    # 获取 m3u8 文件内容
    response = requests.get(m3u8_url)
    lines = response.text.splitlines()

    # 提取视频片段 URL
    ts_urls = [line.strip() for line in lines if line.startswith("http")]

    # 使用 ffmpeg 合并视频片段
    ffmpeg.concat(*ts_urls, a=None).output(output_file).run()
