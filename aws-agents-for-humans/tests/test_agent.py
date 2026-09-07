import pytest

from handoff_guard.agent import ModelCallLimit, local_endpoint


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://api.openai.com/v1",
        "http://example.com/v1",
        "http://localhost/v1",
        "http://127.0.0.1@evil.test/v1",
        "file:///etc/passwd",
        "http://127.0.0.1/v1?key=secret",
    ],
)
def test_remote_inference_rejected(endpoint):
    with pytest.raises(ValueError, match="loopback"):
        local_endpoint(endpoint)


@pytest.mark.parametrize("endpoint", ["http://127.0.0.1:8087/v1", "http://[::1]:8087/v1"])
def test_loopback_supported(endpoint):
    assert local_endpoint(endpoint) == endpoint


def test_model_calls_are_bounded():
    limiter = ModelCallLimit(limit=2)
    limiter.before_call(None)
    limiter.before_call(None)
    with pytest.raises(RuntimeError, match="limit reached"):
        limiter.before_call(None)
