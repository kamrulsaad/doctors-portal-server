import express from 'express'
import cors from "cors"
import 'dotenv/config'
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import sgTransport from 'nodemailer-sendgrid-transport'
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000
const app = express()

app.use(cors())
app.use(express.json())

// verify token middleware function 

function verifyJWT(req, res, next) {
    const authorization = req.headers.authorization
    if (!authorization) return res.status(401).send({ message: 'Unauthorized Access' })
    const token = authorization.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) return res.status(403).send({ message: 'Forbidden Access' })
        req.decoded = decoded
        next()
    })
}

const emailSenderOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}

const sgClient = nodemailer.createTransport(sgTransport(emailSenderOptions));


function senAppointmentEmail(booking) {

    const { patient, patientEmail, date, slot, treatment } = booking

    const email = {
        from: process.env.EMAIL_SENDER,
        to: patientEmail,
        subject: `Your Appointment for ${treatment} is booked on ${date} at ${slot}`,
        text: `Your Appointment for ${treatment} is booked on ${date} at ${slot}`,
        html: `
        <h2>Hello ${patient}</h2>
        <p>You have recieved this email for booking a slot for ${treatment}.</p>
        <p>The booking is fixed on ${date} at ${slot}</p>
        <p>We're highlt delighted to have you for providing you the world's best medical treatment service. Hope to see you soon.</p>
        <p>Any Issues, Contact us: +880123456789</p>
        <a href='https://marvelous-toy-store.web.app/'>Follow us</a>
        `
    };

    sgClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ' + info);
        }
    });
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@doctors-portal.yfumd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

async function run() {
    try {
        await client.connect()

        const servicesCollection = client.db("doctors_portal").collection("services")
        const bookingCollection = client.db("doctors_portal").collection("booking")
        const usersCollection = client.db("doctors_portal").collection("users")
        const paymentCollection = client.db("doctors_portal").collection("payment")

        // verify Admin middleware

        async function verfyAdmin(req, res, next) {
            const requester = req.decoded.email
            const requestedAccount = await usersCollection.findOne({ email: requester })
            if (requestedAccount.role === 'Admin') {
                next()
            }
            else res.status(403).send({ message: "Forbidden Access" })
        }

        // all services API 

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = servicesCollection.find(query).project({ name: 1 })
            const result = await cursor.toArray()
            res.send(result)
        })

        // booking API 

        app.post('/booking', async (req, res) => {
            const booking = req.body
            const query = { treatment: booking.treatment, patientEmail: booking.patientEmail, date: booking.date }
            const exists = await bookingCollection.findOne(query)
            if (exists) return res.send({ success: false, booking: exists })
            const result = await bookingCollection.insertOne(booking)
            senAppointmentEmail(booking)
            res.send({ success: true, result })
        })

        app.get('/booking', verifyJWT, async (req, res) => {
            const patientEmail = req.query.email
            const decodedEmail = req.decoded.email
            if (patientEmail === decodedEmail) {
                const query = { patientEmail: patientEmail }
                const result = await bookingCollection.find(query).toArray()
                res.send(result)
            }
            else return res.status(403).send({ message: 'Forbidden Access' })
        })
    
        app.patch('/booking/:id', verifyJWT, async(req, res) => {
            const id = req.params.id
            const payment = req.body
            const filter = {_id : ObjectId(id)}
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const result = paymentCollection.insertOne(payment)
            const updatedBooking = await bookingCollection.updateOne(filter, updateDoc)
            res.send(updatedBooking)

        })

        // availbale appointments API 

        app.get('/available', async (req, res) => {
            const services = await servicesCollection.find().toArray()
            const query = { date: req.query.date }
            const bookings = await bookingCollection.find(query).toArray()
            services.forEach(service => {
                const serviceBooking = bookings.filter(b => b.treatment === service.name)
                const booked = serviceBooking.map(s => s.slot)
                service.booked = booked;
                const availbale = service.slots.filter(s => !booked.includes(s))
                service.slots = availbale
            })

            res.send(services)
        })

        // users API

        app.get('/users', verifyJWT, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.delete('/users', verifyJWT, async (req, res) => {
            const query = { email: req.query.email }
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '3d' })
            res.send({ result, token })
        })

        app.get('/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            const user = await usersCollection.findOne({ email })
            const isAdmin = user.role === "Admin"
            res.send({ admin: isAdmin })
        })

        app.put('/user/admin/:email', verifyJWT, verfyAdmin, async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const updateDoc = {
                $set: { role: "Admin" }
            }
            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result)

        })

        // doctors API 

        app.get('/doctors', verifyJWT, verfyAdmin, async (req, res) => {
            const result = await doctorsCollection.find().toArray()
            res.send(result)
        })

        app.post('/doctors', verifyJWT, verfyAdmin, async (req, res) => {
            const doctor = req.body
            const result = await doctorsCollection.insertOne(doctor)
            res.send(result)
        })

        app.delete('/doctor/:email', verifyJWT, verfyAdmin, async (req, res) => {
            const email = req.params.email
            const result = await doctorsCollection.deleteOne({ email })
            res.send(result)
        })

        // payment API 

        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price* 100
            const paymentIntent = await stripe.paymentIntents.create({
              amount,
              currency: "usd",
              payment_method_types: ['card'],
            });
          
            res.send({
              clientSecret: paymentIntent.client_secret,
            });
          });

        app.get('/payment/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const result = await bookingCollection.findOne(filter)
            res.send(result)
        })


    }
    finally {

    }
}

run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello form doctors portal')
})

app.listen(port, () => {
    console.log(port)
})

