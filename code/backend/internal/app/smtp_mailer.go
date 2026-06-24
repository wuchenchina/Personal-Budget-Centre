package app

import (
	"bufio"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

func (a *App) sendMail(to, subject, body string) error {
	if a.cfg.SMTPHost == "" || a.cfg.SMTPUsername == "" || a.cfg.SMTPPassword == "" {
		return fmt.Errorf("smtp is not configured")
	}
	from := a.cfg.MailFrom
	if from == "" {
		from = a.cfg.SMTPUsername
	}
	if a.cfg.SMTPPort == 465 {
		return a.sendMailTLS(to, from, subject, body)
	}
	auth := smtp.PlainAuth("", a.cfg.SMTPUsername, a.cfg.SMTPPassword, a.cfg.SMTPHost)
	return smtp.SendMail(a.cfg.SMTPHost+":"+strconv.Itoa(a.cfg.SMTPPort), auth, from, []string{to}, []byte(mailMessage(from, a.cfg.MailFromName, to, subject, body)))
}

func (a *App) sendMailTLS(to, from, subject, body string) error {
	address := a.cfg.SMTPHost + ":" + strconv.Itoa(a.cfg.SMTPPort)
	dialer := net.Dialer{Timeout: 15 * time.Second}
	conn, err := tls.DialWithDialer(&dialer, "tcp", address, &tls.Config{ServerName: a.cfg.SMTPHost})
	if err != nil {
		return err
	}
	defer conn.Close()
	reader := bufio.NewReader(conn)
	if err := smtpExpect(reader, 220); err != nil {
		return err
	}
	commands := []struct {
		command  string
		expected []int
	}{
		{"EHLO budgetcentre.local", []int{250}},
		{"AUTH LOGIN", []int{334}},
		{base64.StdEncoding.EncodeToString([]byte(a.cfg.SMTPUsername)), []int{334}},
		{base64.StdEncoding.EncodeToString([]byte(a.cfg.SMTPPassword)), []int{235}},
		{"MAIL FROM:<" + from + ">", []int{250}},
		{"RCPT TO:<" + to + ">", []int{250, 251}},
		{"DATA", []int{354}},
	}
	for _, item := range commands {
		if _, err := fmt.Fprintf(conn, "%s\r\n", item.command); err != nil {
			return err
		}
		if err := smtpExpect(reader, item.expected...); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(conn, "%s\r\n.\r\n", escapeSMTPBody(mailMessage(from, a.cfg.MailFromName, to, subject, body))); err != nil {
		return err
	}
	if err := smtpExpect(reader, 250); err != nil {
		return err
	}
	_, _ = fmt.Fprint(conn, "QUIT\r\n")
	_ = smtpExpect(reader, 221)
	return nil
}

func smtpExpect(reader *bufio.Reader, expected ...int) error {
	var response string
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return err
		}
		response += line
		if len(line) < 4 || line[3] != '-' {
			break
		}
	}
	code, _ := strconv.Atoi(strings.TrimSpace(response[:3]))
	for _, item := range expected {
		if code == item {
			return nil
		}
	}
	return fmt.Errorf("smtp command failed: %s", response)
}

func mailMessage(from, fromName, to, subject, body string) string {
	headers := []string{
		"From: " + encodedHeader(fromName) + " <" + from + ">",
		"To: <" + to + ">",
		"Subject: " + encodedHeader(subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
	}
	return strings.Join(headers, "\r\n") + "\r\n\r\n" + body
}

func encodedHeader(value string) string {
	if value == "" {
		value = "BudgetCentre"
	}
	return "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(value)) + "?="
}

func escapeSMTPBody(body string) string {
	lines := strings.Split(body, "\n")
	for i, line := range lines {
		if strings.HasPrefix(line, ".") {
			lines[i] = "." + line
		}
	}
	return strings.Join(lines, "\n")
}
