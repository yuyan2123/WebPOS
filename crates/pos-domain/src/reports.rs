use crate::{DomainError, error::finite};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportInput {
    #[serde(default)]
    pub date: String,
    pub orders: Vec<ReportOrder>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportOrder {
    pub total_amount: f64,
    pub items: Vec<ReportItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportItem {
    pub name: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub subtotal: f64,
    pub gift_box: bool,
    pub size: f64,
    pub components: Vec<Component>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Component {
    pub report_name: String,
    pub demand_name: String,
    pub quantity: f64,
    pub price: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductSales {
    pub product_name: String,
    pub quantity: f64,
    pub amount: f64,
    pub unit_price: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_from_gift_box: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_gift_box: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyReport {
    pub date: String,
    pub total_revenue: f64,
    pub total_orders: usize,
    pub total_items: f64,
    pub product_sales: Vec<ProductSales>,
}

fn add_sale(
    sales: &mut Vec<ProductSales>,
    name: &str,
    quantity: f64,
    amount: f64,
    price: f64,
    gift_box: bool,
) -> Result<(), DomainError> {
    if let Some(sale) = sales.iter_mut().find(|sale| sale.product_name == name) {
        sale.quantity = finite(sale.quantity + quantity)?;
        sale.amount = finite(sale.amount + amount)?;
    } else {
        sales.push(ProductSales {
            product_name: name.into(),
            quantity: finite(quantity)?,
            amount: finite(amount)?,
            unit_price: finite(price)?,
            is_from_gift_box: gift_box.then_some(true),
            is_gift_box: (!gift_box).then_some(false),
        });
    }
    Ok(())
}

pub fn daily_report(input: ReportInput) -> Result<DailyReport, DomainError> {
    let mut result = DailyReport {
        date: input.date,
        total_revenue: 0.0,
        total_orders: input.orders.len(),
        total_items: 0.0,
        product_sales: vec![],
    };
    for order in input.orders {
        result.total_revenue = finite(result.total_revenue + order.total_amount)?;
        for item in order.items {
            if item.gift_box {
                for component in item.components {
                    let quantity = finite(component.quantity * item.quantity)?;
                    result.total_items = finite(result.total_items + quantity)?;
                    add_sale(
                        &mut result.product_sales,
                        &component.report_name,
                        quantity,
                        quantity * component.price,
                        component.price,
                        true,
                    )?;
                }
            } else {
                result.total_items = finite(result.total_items + item.quantity)?;
                add_sale(
                    &mut result.product_sales,
                    &item.name,
                    item.quantity,
                    item.subtotal,
                    item.unit_price,
                    false,
                )?;
            }
        }
    }
    // Stable sorting retains first-seen order for ties, matching existing reports.
    result
        .product_sales
        .sort_by(|a, b| b.amount.total_cmp(&a.amount));
    Ok(result)
}

#[derive(Serialize)]
pub struct ProductDemand {
    pub name: String,
    pub loose: f64,
    pub inbox: f64,
    pub total: f64,
}
#[derive(Serialize)]
pub struct GiftboxDemand {
    pub size: String,
    pub count: f64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Demand {
    pub product_stats: Vec<ProductDemand>,
    pub giftbox_stats: Vec<GiftboxDemand>,
    pub order_count: usize,
}

fn add_demand(
    products: &mut Vec<ProductDemand>,
    name: &str,
    quantity: f64,
    gift_box: bool,
) -> Result<(), DomainError> {
    let index = match products.iter().position(|product| product.name == name) {
        Some(index) => index,
        None => {
            products.push(ProductDemand {
                name: name.into(),
                loose: 0.0,
                inbox: 0.0,
                total: 0.0,
            });
            products.len() - 1
        }
    };
    let product = &mut products[index];
    if gift_box {
        product.inbox = finite(product.inbox + quantity)?;
    } else {
        product.loose = finite(product.loose + quantity)?;
    }
    product.total = finite(product.loose + product.inbox)?;
    Ok(())
}

pub fn demand(input: ReportInput) -> Result<Demand, DomainError> {
    let mut result = Demand {
        product_stats: vec![],
        giftbox_stats: vec![],
        order_count: input.orders.len(),
    };
    let mut boxes: Vec<(f64, f64)> = vec![];
    for order in input.orders {
        for item in order.items {
            if item.gift_box {
                if let Some((_, count)) = boxes.iter_mut().find(|(size, _)| *size == item.size) {
                    *count = finite(*count + item.quantity)?;
                } else {
                    boxes.push((finite(item.size)?, finite(item.quantity)?));
                }
                for component in item.components {
                    add_demand(
                        &mut result.product_stats,
                        &component.demand_name,
                        component.quantity * item.quantity,
                        true,
                    )?;
                }
            } else {
                add_demand(&mut result.product_stats, &item.name, item.quantity, false)?;
            }
        }
    }
    result
        .product_stats
        .sort_by(|a, b| b.total.total_cmp(&a.total));
    boxes.sort_by(|a, b| a.0.total_cmp(&b.0));
    result.giftbox_stats = boxes
        .into_iter()
        .map(|(size, count)| GiftboxDemand {
            size: format!("{size}粒裝"),
            count,
        })
        .collect();
    Ok(result)
}
