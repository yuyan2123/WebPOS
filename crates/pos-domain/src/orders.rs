use crate::{DomainError, error::finite};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitItem {
    pub quantity: f64,
    pub gift_box: bool,
    pub size: f64,
    pub products: Vec<f64>,
}

pub fn order_units(items: &[UnitItem]) -> Result<f64, DomainError> {
    let mut total = 0.0;
    for item in items {
        let quantity = finite(item.quantity)?.trunc();
        let mut per_box = 0.0;
        for quantity in &item.products {
            per_box += finite(*quantity)?.trunc();
        }
        if per_box == 0.0 {
            per_box = finite(item.size)?.trunc();
        }
        total += if item.gift_box {
            per_box * quantity
        } else {
            quantity
        };
    }
    finite(total)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceInput {
    pub price: f64,
    pub company_price: f64,
    pub company: bool,
}

pub fn effective_price(input: PriceInput) -> Result<f64, DomainError> {
    finite(if input.company && input.company_price > 0.0 {
        input.company_price
    } else {
        input.price
    })
}

#[derive(Deserialize)]
pub struct PaymentInput {
    pub total: f64,
    pub paid: f64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub deposit_amount: f64,
    pub remaining_amount: f64,
    pub new_status: &'static str,
}

pub fn payment(input: PaymentInput) -> Result<Payment, DomainError> {
    finite(input.total)?;
    finite(input.paid)?;
    if input.paid < 0.0 {
        return Err(DomainError::InvalidInput("訂金不可小於 0"));
    }
    if input.paid > input.total {
        return Err(DomainError::InvalidInput("訂金不能超過總金額"));
    }
    Ok(Payment {
        deposit_amount: input.paid,
        remaining_amount: input.total - input.paid,
        new_status: if input.paid == 0.0 {
            "已確認"
        } else if input.paid < input.total {
            "已付訂金"
        } else {
            "已付清"
        },
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionInput {
    pub original_total: f64,
    pub total: f64,
    pub deposit: f64,
    pub status: String,
    pub notes: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub status: String,
    pub deposit_amount: f64,
    pub remaining_amount: f64,
    pub payment_notes: String,
}

pub fn revise_payment(input: RevisionInput) -> Result<Revision, DomainError> {
    finite(input.original_total)?;
    finite(input.total)?;
    finite(input.deposit)?;
    let mut result = Revision {
        status: input.status,
        deposit_amount: input.deposit,
        remaining_amount: (input.total - input.deposit).max(0.0),
        payment_notes: input.notes,
    };
    if ["完成", "已付款", "已付清"].contains(&result.status.as_str())
        && input.original_total != input.total
    {
        let difference = input.total - input.original_total;
        if !result.payment_notes.is_empty() {
            result.payment_notes.push_str("; ");
        }
        if difference > 0.0 {
            result.status = "已確認".into();
            result.deposit_amount = if input.deposit == 0.0 {
                input.original_total
            } else {
                input.deposit
            }
            .min(input.total);
            result.remaining_amount = input.total - result.deposit_amount;
            result.payment_notes.push_str(&format!(
                "編輯訂單後需補差額 NT$ {}",
                result.remaining_amount
            ));
        } else {
            result.remaining_amount = 0.0;
            result
                .payment_notes
                .push_str(&format!("編輯訂單後應退款 NT$ {}", difference.abs()));
        }
    }
    Ok(result)
}
