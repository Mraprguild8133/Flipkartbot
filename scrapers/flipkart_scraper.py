#!/usr/bin/env python3
"""
Real-time Flipkart Product Scraper
Gets actual product data from Flipkart search results
"""

import requests
import json
import re
import sys
from urllib.parse import quote, urljoin
import trafilatura
from bs4 import BeautifulSoup
import time
import random

class FlipkartScraper:
    def __init__(self):
        self.base_url = "https://www.flipkart.com"
        self.search_url = "https://www.flipkart.com/search"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }

    def search_products(self, query, max_results=25):
        """Search for products on Flipkart"""
        try:
            search_params = {
                'q': query,
                'page': 1
            }
            
            products = []
            pages_to_scrape = min(3, (max_results // 10) + 1)
            
            for page in range(1, pages_to_scrape + 1):
                search_params['page'] = page
                
                # Add random delay to avoid rate limiting
                time.sleep(random.uniform(1, 2))
                
                response = requests.get(self.search_url, params=search_params, headers=self.headers, timeout=10)
                
                if response.status_code != 200:
                    break
                    
                page_products = self.parse_search_results(response.text, query)
                products.extend(page_products)
                
                if len(products) >= max_results:
                    break
            
            return {
                'success': True,
                'products': products[:max_results],
                'total': len(products),
                'query': query,
                'source': 'flipkart_live'
            }
            
        except Exception as e:
            print(f"Error scraping Flipkart: {e}", file=sys.stderr)
            return {
                'success': False,
                'products': [],
                'error': str(e),
                'query': query
            }

    def parse_search_results(self, html_content, query):
        """Parse product information from search results HTML"""
        products = []
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Find product containers (Flipkart uses different classes, so we try multiple)
            product_containers = (
                soup.find_all('div', {'data-id': True}) or
                soup.find_all('div', class_=re.compile(r'.*product.*', re.I)) or
                soup.find_all('div', class_=re.compile(r'.*item.*', re.I))
            )
            
            for container in product_containers[:25]:  # Limit to avoid too much processing
                try:
                    product = self.extract_product_info(container, query)
                    if product and product.get('title') and product.get('price'):
                        products.append(product)
                except Exception as e:
                    continue
                    
        except Exception as e:
            print(f"Error parsing HTML: {e}", file=sys.stderr)
        
        return products

    def extract_product_info(self, container, query):
        """Extract product information from a container element"""
        try:
            product = {}
            
            # Extract title
            title_elem = (
                container.find('a', class_=re.compile(r'.*title.*', re.I)) or
                container.find('div', class_=re.compile(r'.*title.*', re.I)) or
                container.find('span', class_=re.compile(r'.*title.*', re.I)) or
                container.find('h3') or
                container.find('h2')
            )
            
            if title_elem:
                product['title'] = title_elem.get_text(strip=True)[:100]
            
            # Extract price
            price_elem = (
                container.find('div', string=re.compile(r'₹[\d,]+')) or
                container.find('span', string=re.compile(r'₹[\d,]+')) or
                container.find(text=re.compile(r'₹[\d,]+'))
            )
            
            if price_elem:
                price_text = str(price_elem)
                price_match = re.search(r'₹([\d,]+)', price_text)
                if price_match:
                    product['sellingPrice'] = int(price_match.group(1).replace(',', ''))
            
            # Extract original price (MRP)
            mrp_elem = container.find(text=re.compile(r'₹[\d,]+'))
            if mrp_elem:
                mrp_text = str(mrp_elem)
                mrp_match = re.search(r'₹([\d,]+)', mrp_text)
                if mrp_match:
                    mrp_price = int(mrp_match.group(1).replace(',', ''))
                    if mrp_price > product.get('sellingPrice', 0):
                        product['mrp'] = mrp_price
            
            # Extract image URL
            img_elem = container.find('img')
            if img_elem and img_elem.get('src'):
                img_url = img_elem['src']
                if img_url.startswith('//'):
                    img_url = 'https:' + img_url
                elif img_url.startswith('/'):
                    img_url = 'https://www.flipkart.com' + img_url
                product['imageUrl'] = img_url
            
            # Extract product URL
            link_elem = container.find('a', href=True)
            if link_elem:
                product_url = link_elem['href']
                if product_url.startswith('/'):
                    product_url = 'https://www.flipkart.com' + product_url
                product['url'] = product_url
                product['flipkartUrl'] = product_url
            
            # Extract rating
            rating_elem = container.find(text=re.compile(r'[0-9.]+\s*★'))
            if rating_elem:
                rating_match = re.search(r'([0-9.]+)', str(rating_elem))
                if rating_match:
                    product['rating'] = float(rating_match.group(1))
            
            # Add default values
            product.update({
                'productId': f"live_{abs(hash(product.get('title', query)))}",
                'description': f"Real-time {query} product from Flipkart with latest pricing and availability.",
                'inStock': True,
                'category': self.get_category_from_query(query),
                'brand': self.extract_brand_from_title(product.get('title', '')),
                'availability': 'In Stock',
                'source': 'flipkart_live'
            })
            
            # Calculate discount if both prices available
            if product.get('mrp') and product.get('sellingPrice'):
                discount = round(((product['mrp'] - product['sellingPrice']) / product['mrp']) * 100)
                product['discount'] = discount
            
            return product if product.get('title') and product.get('sellingPrice') else None
            
        except Exception as e:
            return None

    def get_category_from_query(self, query):
        """Determine category from search query"""
        query_lower = query.lower()
        
        categories = {
            'mobile': ['phone', 'mobile', 'smartphone', 'redmi', 'iphone', 'samsung', 'oneplus', 'realme', 'vivo', 'oppo'],
            'laptop': ['laptop', 'computer', 'pc', 'macbook', 'dell', 'hp', 'lenovo', 'asus'],
            'electronics': ['tv', 'television', 'headphone', 'speaker', 'camera', 'tablet'],
            'fashion': ['shirt', 'clothing', 'fashion', 'dress', 'shoe', 'watch', 'bag'],
            'home': ['refrigerator', 'washing machine', 'ac', 'microwave', 'furniture'],
            'books': ['book', 'novel', 'textbook', 'education']
        }
        
        for category, keywords in categories.items():
            if any(keyword in query_lower for keyword in keywords):
                return category
        
        return 'general'

    def extract_brand_from_title(self, title):
        """Extract brand name from product title"""
        if not title:
            return 'Brand'
            
        brands = ['Samsung', 'Apple', 'Xiaomi', 'OnePlus', 'Realme', 'Vivo', 'Oppo', 'Nokia', 
                 'Motorola', 'Sony', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'MSI']
        
        title_upper = title.upper()
        for brand in brands:
            if brand.upper() in title_upper:
                return brand
                
        # Extract first word as potential brand
        words = title.split()
        return words[0] if words else 'Brand'

def main():
    """Main function for command line usage"""
    if len(sys.argv) != 2:
        print("Usage: python3 flipkart_scraper.py 'search_query'")
        sys.exit(1)
    
    query = sys.argv[1]
    scraper = FlipkartScraper()
    result = scraper.search_products(query)
    
    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()