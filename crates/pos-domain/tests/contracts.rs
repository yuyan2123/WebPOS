use pos_domain::*;
use serde_json::{Value, json};

fn run(operation: &str, input: Value) -> Result<Value, Box<dyn std::error::Error>> {
    let output = evaluate(&json!({"operation": operation, "input": input}).to_string())?;
    Ok(serde_json::from_str(&output)?)
}

#[test]
fn unit_composition_and_legacy_size() -> Result<(), Box<dyn std::error::Error>> {
    let result = run(
        "units",
        json!([
            {"quantity":3,"giftBox":false,"size":1,"products":[]},
            {"quantity":2,"giftBox":true,"size":10,"products":[2,4]},
            {"quantity":2,"giftBox":true,"size":8,"products":[]}
        ]),
    )?;
    assert_eq!(result, 31.0);
    Ok(())
}

#[test]
fn capacity_thresholds_and_projection() -> Result<(), Box<dyn std::error::Error>> {
    for (current, new, status) in [
        (69, 0, "available"),
        (70, 0, "warning"),
        (90, 0, "nearFull"),
        (100, 0, "full"),
        (99, 2, "exceeded"),
    ] {
        let result = run(
            "capacity",
            json!({"limit":100,"hasLimit":true,"source":"weeklyDefault","currentQuantity":current,"newOrderQuantity":new}),
        )?;
        assert_eq!(result["status"], status);
    }
    let result = run(
        "capacity",
        json!({"limit":0,"hasLimit":false,"source":"none","currentQuantity":400,"newOrderQuantity":2}),
    )?;
    assert_eq!(result["status"], "unlimited");
    assert_eq!(result["projectedQuantity"], 402.0);
    Ok(())
}

#[test]
fn payment_transitions_and_rejection() -> Result<(), Box<dyn std::error::Error>> {
    for (paid, status) in [(0, "已確認"), (50, "已付訂金"), (100, "已付清")] {
        assert_eq!(
            run("payment", json!({"total":100,"paid":paid}))?["newStatus"],
            status
        );
    }
    assert!(run("payment", json!({"total":100,"paid":101})).is_err());
    assert!(run("payment", json!({"total":100,"paid":-1})).is_err());
    Ok(())
}

#[test]
fn editing_paid_order_retains_refund_and_surcharge_rules() -> Result<(), Box<dyn std::error::Error>>
{
    let result = run(
        "revisePayment",
        json!({"originalTotal":100,"total":120,"deposit":0,"status":"完成","notes":"現金"}),
    )?;
    assert_eq!(result["depositAmount"], 100.0);
    assert_eq!(result["remainingAmount"], 20.0);
    assert_eq!(result["status"], "已確認");
    let result = run(
        "revisePayment",
        json!({"originalTotal":100,"total":80,"deposit":100,"status":"已付清","notes":""}),
    )?;
    assert_eq!(result["depositAmount"], 100.0);
    assert_eq!(result["remainingAmount"], 0.0);
    assert_eq!(result["paymentNotes"], "編輯訂單後應退款 NT$ 20");
    Ok(())
}

#[test]
fn reports_expand_boxes_and_include_shipping_only_in_revenue()
-> Result<(), Box<dyn std::error::Error>> {
    let input = json!({"date":"2026-09-06","orders":[{"totalAmount":500,"items":[
        {"name":"餅","quantity":2,"unitPrice":50,"subtotal":100,"giftBox":false,"size":0,"components":[]},
        {"name":"盒","quantity":2,"unitPrice":150,"subtotal":300,"giftBox":true,"size":6,"components":[{"reportName":"餅","demandName":"餅","quantity":6,"price":50}]}
    ]}]});
    let report = run("report", input.clone())?;
    assert_eq!(report["totalRevenue"], 500.0);
    assert_eq!(report["totalItems"], 14.0);
    assert_eq!(report["productSales"][0]["amount"], 700.0);
    let demand = run("demand", input)?;
    assert_eq!(demand["productStats"][0]["loose"], 2.0);
    assert_eq!(demand["productStats"][0]["inbox"], 12.0);
    assert_eq!(demand["giftboxStats"][0]["count"], 2.0);
    Ok(())
}

#[test]
fn malformed_contracts_fail_closed() {
    assert!(evaluate("{}").is_err());
    assert!(evaluate(r#"{"operation":"unknown","input":{}}"#).is_err());
}
