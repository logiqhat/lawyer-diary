variable "privacy_policy_bucket_name" {
  description = "S3 bucket to host the privacy policy (must be globally unique). Defaults to <project>-<stage>-privacy-policy."
  type        = string
  default     = null
}

locals {
  privacy_policy_bucket = coalesce(var.privacy_policy_bucket_name, "${var.project}-${var.stage}-privacy-policy")
}

resource "aws_s3_bucket" "privacy_policy" {
  bucket = local.privacy_policy_bucket
}

resource "aws_s3_bucket_ownership_controls" "privacy_policy" {
  bucket = aws_s3_bucket.privacy_policy.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_public_access_block" "privacy_policy" {
  bucket = aws_s3_bucket.privacy_policy.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_cors_configuration" "privacy_policy" {
  bucket = aws_s3_bucket.privacy_policy.id

  cors_rule {
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
    allowed_headers = ["*"]
    max_age_seconds = 300
  }
}

resource "aws_s3_bucket_website_configuration" "privacy_policy" {
  bucket = aws_s3_bucket.privacy_policy.id

  index_document {
    suffix = "privacy-policy.html"
  }
}

resource "aws_s3_bucket_policy" "privacy_policy" {
  bucket = aws_s3_bucket.privacy_policy.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow",
        Principal = "*",
        Action    = ["s3:GetObject"],
        Resource  = "${aws_s3_bucket.privacy_policy.arn}/*"
      }
    ]
  })
}

resource "aws_s3_object" "privacy_policy" {
  bucket       = aws_s3_bucket.privacy_policy.id
  key          = "privacy-policy.html"
  source       = "${path.module}/../../static-website/public/privacy-policy.html"
  content_type = "text/html"
  etag         = filemd5("${path.module}/../../static-website/public/privacy-policy.html")

  # Require ownership controls to be created before ACL
  depends_on = [
    aws_s3_bucket_public_access_block.privacy_policy,
    aws_s3_bucket_ownership_controls.privacy_policy
  ]

  acl = "public-read"
}

output "privacy_policy_url" {
  description = "Public URL for the hosted privacy policy"
  value       = "https://${aws_s3_bucket.privacy_policy.bucket}.s3.${var.aws_region}.amazonaws.com/${aws_s3_object.privacy_policy.key}"
}
