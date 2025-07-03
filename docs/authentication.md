# API Authentication: Using JWTs

Our API is protected by JWTs (JSON Web Tokens) to ensure that only authorized clients can access our moderation services.

## Key Concepts
* **`client_id` and `client_secret`:** Your unique credentials to identify your application. These are obtained from your [Client Dashboard](#).
* **`/api/token` Endpoint:** The dedicated endpoint for requesting a JWT.
* **JWT (Access Token):** The token you will receive, which is valid for a specific period (e.g., 1 hour).
* **`Authorization` Header:** The HTTP header you will use to send your token in subsequent moderation requests.

## Authentication Flow
1.  Send your `client_id` and `client_secret` to the `/api/token` endpoint.
2.  Receive an `access_token` (JWT) and its expiration time.
3.  Include the `access_token` as a `Bearer Token` in the `Authorization` header for all subsequent requests to the `/api/moderate` endpoint.

## `/api/token` Endpoint Details

### Method
`POST`

### URL
`https://your-domain.com/api/token`

### Request Body (JSON)
The request body should be a JSON object containing your `client_id` and `client_secret`.

```json
{
  "client_id": "your_client_id_from_dashboard",
  "client_secret": "your_client_secret_from_dashboard"
}