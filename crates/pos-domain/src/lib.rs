//! Portable business rules. Firebase and browser APIs belong in host adapters.
// MSVC reports import-library creation on stdout as a rustc warning for native cdylib tests.
#![cfg_attr(target_env = "msvc", allow(linker_messages))]
mod capacity;
mod error;
mod items;
mod orders;
mod reports;

pub use capacity::*;
pub use error::DomainError;
pub use items::*;
pub use orders::*;
pub use reports::*;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(tag = "operation", content = "input", rename_all = "camelCase")]
enum Request {
    NormalizeItem(ItemInput),
    Units(Vec<UnitItem>),
    Capacity(CapacityInput),
    Payment(PaymentInput),
    RevisePayment(RevisionInput),
    Report(ReportInput),
    Demand(ReportInput),
    Price(PriceInput),
}

#[derive(Serialize)]
#[serde(untagged)]
enum Response {
    Item(OrderItem),
    Number(f64),
    Capacity(CapacityStatus),
    Payment(Payment),
    Revision(Revision),
    Report(DailyReport),
    Demand(Demand),
}

pub fn evaluate(request: &str) -> Result<String, DomainError> {
    if request.len() > 16 * 1024 * 1024 {
        return Err(DomainError::InvalidInput("資料量超過允許範圍"));
    }
    let request: Request = serde_json::from_str(request)?;
    let response = match request {
        Request::NormalizeItem(input) => Response::Item(normalize_item(input)?),
        Request::Units(items) => Response::Number(order_units(&items)?),
        Request::Capacity(input) => Response::Capacity(capacity_status(input)?),
        Request::Payment(input) => Response::Payment(payment(input)?),
        Request::RevisePayment(input) => Response::Revision(revise_payment(input)?),
        Request::Report(input) => Response::Report(daily_report(input)?),
        Request::Demand(input) => Response::Demand(demand(input)?),
        Request::Price(input) => Response::Number(effective_price(input)?),
    };
    Ok(serde_json::to_string(&response)?)
}

#[wasm_bindgen]
pub fn execute(request: &str) -> Result<String, JsValue> {
    evaluate(request).map_err(|error| JsValue::from_str(&error.to_string()))
}
