<?php

class ContactForm {
    private $recipient;
    private $fromName;
    private $fromEmail;

    public function __construct($recipient, $fromName, $fromEmail) {
        $this->recipient = $recipient;
        $this->fromName = $fromName;
        $this->fromEmail = $fromEmail;
    }

    public function sendEmail($name, $email, $phone, $subject, $message) {
        $email_content = $this->buildEmailContent($name, $email, $phone, $subject, $message);
        $email_headers = $this->buildEmailHeaders();

        if (mail($this->recipient, $subject, $email_content, $email_headers)) {
            http_response_code(200);
            echo "Thank You! Your message has been sent.";
        } else {
            http_response_code(500);
            echo "Oops! Something went wrong and we couldn't send your message.";
        }
    }

    private function buildEmailContent($name, $email, $phone, $subject, $message) {
        $content = "";
        $fields = array(
            "Name" => $name,
            "Email" => $email,
            "Phone" => $phone,
            "Subject" => $subject,
            "Message" => $message
        );
        foreach ($fields as $fieldName => $fieldValue) {
            if (!empty($fieldValue)) {
                $content .= "$fieldName: $fieldValue \r\n\n";
            }
        }
        return $content;
    }

    private function buildEmailHeaders() {
        $headers = "From: {$this->fromName} <{$this->fromEmail}>\r\n";
        $headers .= "Reply-To: {$this->fromEmail}\r\n";
        $headers .= "X-Mailer: PHP/" . phpversion();
        return $headers;
    }
}


$recipient = "soukhinkhan271@gmail.com";
$fromName = "RRDevs";
$fromEmail = "hellow@rrdevs.net";

$contactForm = new ContactForm($recipient, $fromName, $fromEmail);

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $name = strip_tags(trim($_POST["name"]));
    $name = str_replace(array("\r","\n"),array(" "," "),$name);
    $email = filter_var(trim($_POST["email"]), FILTER_SANITIZE_EMAIL);
    $phone = trim($_POST["phone"]);
    $subject = trim($_POST["subject"]);
    $message = trim($_POST["textarea"]);

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo "Please complete the form and try again.";
        exit;
    }

    $contactForm->sendEmail($name, $email, $phone, $subject, $message);
} else {
    http_response_code(403);
    echo "There was a problem with your submission, please try again.";
}
