use crate::{DomainError, error::finite};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInput {
    pub detail_id: String,
    pub product_id: String,
    pub product_name: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub gift_box: bool,
    pub size: f64,
    pub products: Vec<(String, f64)>,
    pub notes: String,
    pub original_price: f64,
    pub is_special_price: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftBoxDetails {
    pub size: f64,
    pub products: BTreeMap<String, f64>,
    pub notes: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderItem {
    pub detail_id: String,
    pub product_id: String,
    pub product_name: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub subtotal: f64,
    pub is_gift_box: bool,
    pub gift_box_details: Option<GiftBoxDetails>,
    pub original_price: f64,
    pub is_special_price: bool,
}

// Existing limits count JavaScript UTF-16 units, including two units for emoji.
fn length(value: &str) -> usize {
    value.encode_utf16().count()
}
fn require(condition: bool, message: &'static str) -> Result<(), DomainError> {
    if condition {
        Ok(())
    } else {
        Err(DomainError::InvalidInput(message))
    }
}

pub fn normalize_item(input: ItemInput) -> Result<OrderItem, DomainError> {
    let quantity = finite(input.quantity)?.trunc();
    let price = finite(input.unit_price)?;
    require(quantity > 0.0, "商品數量必須大於 0")?;
    require(quantity <= 10000.0, "商品數量超過允許範圍")?;
    require(price >= 0.0, "商品價格不可小於 0")?;
    require(price <= 10000000.0, "商品價格超過允許範圍")?;
    require(length(&input.detail_id) <= 128, "商品明細編號過長")?;
    let gift_box_details = if input.gift_box {
        let size = finite(input.size)?.trunc();
        require(size > 0.0, "禮盒規格不正確")?;
        require(
            !input.products.is_empty() && input.products.len() <= 100,
            "禮盒內容數量不正確",
        )?;
        let mut products = BTreeMap::new();
        for (id, value) in input.products {
            require(
                !id.trim().is_empty() && length(id.trim()) <= 128,
                "禮盒商品編號不正確",
            )?;
            let value = finite(value)?.trunc();
            require(value > 0.0 && value <= 10000.0, "禮盒商品數量不正確")?;
            products.insert(id, value);
        }
        Some(GiftBoxDetails {
            size,
            products,
            notes: input.notes,
        })
    } else {
        require(
            !input.product_id.is_empty() && !input.product_name.is_empty(),
            "商品資料不完整",
        )?;
        require(
            length(&input.product_id) <= 128 && length(&input.product_name) <= 200,
            "商品資料過長",
        )?;
        None
    };
    Ok(OrderItem {
        detail_id: input.detail_id,
        product_id: input.product_id,
        product_name: input.product_name,
        quantity,
        unit_price: price,
        subtotal: finite(price * quantity)?,
        is_gift_box: input.gift_box,
        gift_box_details,
        original_price: finite(input.original_price)?,
        is_special_price: input.is_special_price,
    })
}
