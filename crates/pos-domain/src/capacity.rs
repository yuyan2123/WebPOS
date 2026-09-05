use crate::{DomainError, error::finite};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapacityInput {
    pub limit: f64,
    pub source: CapacitySource,
    pub has_limit: bool,
    pub current_quantity: f64,
    pub new_order_quantity: f64,
}

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CapacitySource {
    None,
    DateOverride,
    WeeklyDefault,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Availability {
    Unlimited,
    Available,
    Warning,
    NearFull,
    Full,
    Exceeded,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CapacityStatus {
    pub limit: f64,
    pub current_quantity: f64,
    pub new_order_quantity: f64,
    pub projected_quantity: f64,
    pub exceeded_quantity: f64,
    pub usage_rate: f64,
    pub status: Availability,
    pub source: CapacitySource,
    pub has_limit: bool,
}

pub fn capacity_status(input: CapacityInput) -> Result<CapacityStatus, DomainError> {
    finite(input.limit)?;
    finite(input.current_quantity)?;
    finite(input.new_order_quantity)?;
    let projected = finite(input.current_quantity + input.new_order_quantity)?;
    let has_limit = input.has_limit && input.limit > 0.0;
    // JavaScript Math.round uses ties towards +infinity; preserve that contract.
    let usage_rate = if has_limit {
        (input.current_quantity / input.limit * 100.0 + 0.5).floor()
    } else {
        0.0
    };
    finite(usage_rate)?;
    let exceeded = if has_limit {
        (projected - input.limit).max(0.0)
    } else {
        0.0
    };
    let status = if !has_limit {
        Availability::Unlimited
    } else if exceeded > 0.0 {
        Availability::Exceeded
    } else if input.current_quantity >= input.limit {
        Availability::Full
    } else if usage_rate >= 90.0 {
        Availability::NearFull
    } else if usage_rate >= 70.0 {
        Availability::Warning
    } else {
        Availability::Available
    };
    Ok(CapacityStatus {
        limit: if has_limit { input.limit } else { 0.0 },
        current_quantity: input.current_quantity,
        new_order_quantity: input.new_order_quantity,
        projected_quantity: projected,
        exceeded_quantity: exceeded,
        usage_rate,
        status,
        source: input.source,
        has_limit,
    })
}
