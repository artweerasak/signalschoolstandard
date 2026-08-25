FROM gotenberg/gotenberg:8

USER root

# ติดตั้ง TLWG Thai fonts (Loma, Waree, Kinnari, Norasi ...) + fontconfig
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
        fonts-thai-tlwg \
        fontconfig \
    && rm -rf /var/lib/apt/lists/*

# ฟอนต์ราชการไทย 14 ฟอนต์ (TH Sarabun New, TH SarabunPSK, TH Niramit AS,
#   TH Srisakdi, TH Baijam, TH K2D July8, TH KoHo, TH Kodchasal, TH Krub,
#   TH Mali Grade6, TH Charmonman, TH Chakra Petch, TH Fahkwang, Chulabhorn Likit)
COPY fonts/thai14font/ /usr/share/fonts/truetype/thai-gov/

# fontconfig aliases: map ชื่อฟอนต์ Windows → ฟอนต์ที่มีในระบบ
COPY 99-military-aliases.conf /etc/fonts/conf.d/99-military-aliases.conf

RUN fc-cache -fv

# converter_server: แปลง binary Office formats → modern XML formats
COPY converter_server.py /usr/local/bin/converter_server.py
COPY entrypoint.sh       /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER gotenberg

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
