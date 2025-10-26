# Importing Required Libraries
import os
import logging
import sqlite3
import asyncio
import re
import time
import tempfile
from typing import Dict, Optional
from datetime import datetime
from itertools import cycle
from contextlib import contextmanager
from collections import defaultdict
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import base64
from starlette.background import BackgroundTasks
from fastapi.responses import JSONResponse
from langchain_community.chat_models import ChatOpenAI
from langchain_openai import OpenAIEmbeddings
from langchain.vectorstores import Chroma
from langchain.chains import ConversationalRetrievalChain
from langchain.prompts import PromptTemplate
from langchain.memory import ConversationBufferWindowMemory
from langchain.schema import HumanMessage, SystemMessage
from datetime import datetime
from fastapi import UploadFile, File, Form
import xml.etree.ElementTree as ET
from dotenv import load_dotenv


load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
    
class QueryRequest(BaseModel):
    query: str
    userId: str
    domain: str
    image: UploadFile | None = None

class Image(BaseModel):
    image: str

# Pydantic model for query
class Query(BaseModel):
    user_message: str
    ai_response: str

    @staticmethod
    def sanitize_text(text: str) -> str:
        return re.sub(r'[^\x00-\x7F]+', '', text)  # Removes non-ASCII characters    

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def get_image_caption(image_path):
    """
    Sends an image to the captioning API and returns the response.

    Args:
        image_path (str): Path to the image file.

    Returns:
        str: Caption response from the API if the request is successful.
        str: Error message if the request fails.
    """
    
    try:
        # Read the image file from the path
        with open(image_path, 'rb') as image_file:
            file_content = image_file.read()
        
        base64_string = base64.b64encode(file_content).decode("utf-8")
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe the visible skin conditions in this image as if you are the person experiencing them. Include details about any redness, discoloration, spots, rashes, texture irregularities, lesions, scars, dryness, or other abnormalities. Share your observations in a natural, self-reflective tone, noting the size, color, distribution, and characteristics of any visible features. Also, consider possible causes for these conditions and how you might address them."},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_string}",
                            },
                        },
                    ],
                },
            ],
            max_tokens=200,
        )
        return response.choices[0].message.content
        
    except FileNotFoundError:
        return "Error: Image file not found."
    except Exception as e:
        return f"An error occurred: {str(e)}"



# Replace MongoDB imports with SQLite setup
@contextmanager
def get_db():
    db = sqlite3.connect('klyraai.db')
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()

# Initialize SQLite database and create table
def init_db():
    with get_db() as db:
        db.execute('''
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                domain TEXT NOT NULL,
                query TEXT NOT NULL,
                response TEXT NOT NULL,
                timestamp DATETIME DEFAULT (datetime('now'))
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS request_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                request_time DATETIME DEFAULT (datetime('now')),
                response_time FLOAT NOT NULL,
                success BOOLEAN NOT NULL,
                error_message TEXT
            )
        ''')
        db.commit()

# Initialize database on startup
init_db()

class UserSession:
    def __init__(self, domain, user_id):
        self.domain = domain
        self.user_id = user_id
        self.last_active = datetime.now()
        # Load last 20 messages from database for this user
        self.chat_history = self._load_chat_history()
        
        # Create user-specific memory
        self.memory = ConversationBufferWindowMemory(
            memory_key="chat_history",
            human_prefix="### Input",
            ai_prefix="### Response",
            output_key="answer",
            return_messages=True,
            k=20  # Keep last 20 messages in memory
        )
        
        # Initialize memory with user's chat history
        for query, response in self.chat_history:
            self.memory.save_context({"input": query}, {"answer": response})
            
        self.conversation = self._create_conversation()

    def _load_chat_history(self):
        with get_db() as db:
            cursor = db.execute('''
                SELECT query, response 
                FROM chat_history 
                WHERE user_id = ? AND domain = ? 
                ORDER BY timestamp DESC LIMIT 20
            ''', (self.user_id, self.domain))
            
            # Return history in chronological order
            history = [(row['query'], row['response']) for row in cursor.fetchall()]
            return history[::-1]  # Reverse to get chronological order

    def save_message(self, query, response):
        with get_db() as db:
            db.execute('''
                INSERT INTO chat_history (user_id, domain, query, response)
                VALUES (?, ?, ?, ?)
            ''', (self.user_id, self.domain, query, response))
            db.commit()

    def _create_conversation(self):
        try:
            return ConversationalRetrievalChain.from_llm(
                llm=llm.current_llm,
                retriever=retrieval,
                memory=self.memory,
                combine_docs_chain_kwargs={"prompt": CONVERSATIONAL_PROMPT},
                return_source_documents=True,
                verbose=True,
            )
        except Exception as e:
            logger.error(f"Error creating conversation chain for user {self.user_id}: {str(e)}")
            raise

sessions: Dict[str, Dict[str, UserSession]] = {}

# Initialize environment and API keys

# Define OpenAI API keys
OPENAI_API_KEYS = [
    os.getenv("OPENAI_API_KEY")
]

# Initialize LangChain OpenAI client
suggetion_llm = ChatOpenAI(
    model="gpt-4o",  # Use "gpt-4-turbo" or "gpt-4" based on your needs
    openai_api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.3,
)

# Initialize embeddings and vector store
embedding = OpenAIEmbeddings(
    model='text-embedding-3-large',
    openai_api_key=os.getenv("OPENAI_API_KEY"),
    dimensions=768  # Set to match existing Chroma collection dimensionality
)

try:
    persist_directory = "chroma"
    vectordb = Chroma(
        persist_directory=persist_directory, 
        embedding_function=embedding
    )
except Exception as e:
    logger.error(f"Error loading ChromaDB: {str(e)}")
    raise RuntimeError(f"Error loading ChromaDB: {str(e)}")

class RotatingOpenAILLM:
    def __init__(self, model: str, temperature: float):
        self.model = model
        self.temperature = temperature
        self.api_keys = cycle(OPENAI_API_KEYS)  # Rotate keys
        self.current_key = next(self.api_keys)
        self.current_llm = self._create_llm()
        self.max_retries = len(OPENAI_API_KEYS) * 2  # Retry twice per key

    def _create_llm(self) -> ChatOpenAI:
        """
        Create an instance of ChatOpenAI with the current API key.
        """
        return ChatOpenAI(
            model=self.model,
            temperature=self.temperature,
            openai_api_key=self.current_key,
            max_retries=1
        )

    def _rotate_key(self):
        """
        Rotate to the next API key in the list.
        """
        self.current_key = next(self.api_keys)
        logger.info(f"Rotating to new API key: {self.current_key[:8]}...")
        self.current_llm = self._create_llm()

    def invoke(self, messages, **kwargs):
        """
        Invoke the ChatOpenAI model with fault-tolerant API key rotation.
        """
        attempts = 0
        last_error = None

        while attempts < self.max_retries:
            try:
                # Make the API call
                return self.current_llm(messages=messages, **kwargs)
            except Exception as e:
                attempts += 1
                last_error = e
                logger.warning(f"API call failed (attempt {attempts}/{self.max_retries}): {str(e)}")
                
                # Rotate to next key and retry
                if attempts < self.max_retries:
                    self._rotate_key()
                    continue
                
                raise Exception(f"All API keys exhausted after {attempts} attempts. Last error: {str(last_error)}")

# Initialize the rotating LLM with GPT-4-turbo
llm = RotatingOpenAILLM(
    model="gpt-4o",
    temperature=0.1
)


retrieval = vectordb.as_retriever(search_type="mmr", k=10)

# Define the conversation prompt template
template = """Hello AI Dermatologist! You are an advanced AI specializing in providing personalized skincare solutions. You will analyze user-provided photos and text inputs to identify skin conditions, recommend natural skincare routines, suggest personalized treatment plans, and recommend suitable products. Your responses should be informative, empathetic, and prioritize user safety.
Here's a detailed guide for your interactions:
You name: Klyra AI. 
Image Analysis:
Request Clear Images: Begin by requesting clear, well-lit photos of the affected skin areas. Specify that photos should be taken without makeup or filters. Example: "Please upload a clear, well-lit photo of the affected area without makeup or filters. This will help me assess your skin condition accurately."
Analyze Visual Cues: Analyze uploaded photos for visual cues like inflammation, redness, pigmentation, scaling, rashes, texture, and pore size.
Determine Skin Type: Infer skin type (oily, dry, combination, sensitive) based on visual cues and user-provided information.
Text Input Interpretation:
Gather Detailed Information: Ask clarifying questions to understand the user's skin concerns, symptoms, current routine, lifestyle, diet, allergies, medical history, medications, and any potential triggers (e.g., stress, specific foods, environmental factors). Example: "Could you describe your current skincare routine? Do you have any known allergies? Are you currently taking any medications?"
Symptom Analysis: Analyze user-described symptoms to identify potential skin conditions like acne, eczema, rosacea, psoriasis, melasma, contact dermatitis, etc.
Personalized Routine & Treatment Plan Generation:
Natural Skincare Routine: Recommend natural skincare routines including gentle cleansers, natural moisturizers, and DIY remedies (e.g., oatmeal baths, aloe vera, tea tree oil) where appropriate. Provide specific instructions and precautions.
Preventive Measures: Suggest preventive measures like sun protection (SPF), avoiding triggers, managing stress, and maintaining a healthy diet.
Daily Routine Structure: Prescribe a detailed daily routine, including cleansing, toning, treating, moisturizing, and protecting.
Medical Treatment Suggestions (Over-the-Counter): Recommend over-the-counter creams, lotions, and medications (e.g., hydrocortisone cream, retinoids, benzoyl peroxide) where appropriate. Clearly state that these are suggestions and not prescriptions.
Medical Treatment Suggestions (Prescription): For conditions potentially requiring prescription medication (e.g., topical antibiotics, steroid creams), clearly advise the user to consult a dermatologist or qualified healthcare professional. Provide information about potential treatment options but refrain from prescribing.
Product Recommendations: Suggest specific products based on the identified skin condition and user preferences. Consider skin type, allergies, and potential sensitivities. Differentiate between natural remedies, over-the-counter products, and prescription medications. Always recommend consulting a doctor before starting any new medication.
Complex Condition Support:
Recognize Complexities: Acknowledge the complexities of overlapping or atypical skin conditions. Example: "Your symptoms suggest a combination of rosacea and acne. It's important to see a dermatologist for a proper diagnosis."
Referral to Specialists: For complex conditions or those requiring specialized care (e.g., psoriatic arthritis, severe allergies), strongly recommend consulting a relevant specialist. Offer interim advice for managing symptoms while awaiting professional consultation.
Interactive Dialogue & Follow-Up:
Clarifying Questions: Ask follow-up questions to refine recommendations and ensure accuracy.
Progress Tracking: Encourage users to provide updates and upload follow-up photos to monitor progress and adjust recommendations as needed.
Educational Insights:
Provide Educational Content: Offer concise explanations of potential skin conditions, including causes, triggers, and long-term management strategies.
Prevention Tips: Provide general skincare tips for maintaining healthy skin.
Ethical and Safe Recommendations:
Prioritize Safety: Always prioritize user safety. Clearly state when a condition requires professional medical evaluation. Emphasize that your advice is not a substitute for professional medical care. Example: "While these suggestions may help, it's crucial to consult a dermatologist for a proper diagnosis and personalized treatment plan."

Product recommendation: 
After prescribing, suggest the products the patient needs to improve or recover his condition in this way, 
Suggested Ingredients. Ensure the product information is complete, including:

Product XML Response: Format the response as a XML object with one main field:
products: An array of product objects, each containing:
id: A unique identifier
image_url: The product image URL
name: Product name
highlights: Key features
price: Product price
buy_link: Product page URL

Ensure that the response is structured in a way that the assistant provides a list of products with these details.

Example:

Answer: Dealing with acne can be frustrating! Before we look at products, here are a few things you can try:

Gentle Cleansing: Wash your face twice daily with a mild, fragrance-free cleanser. Avoid harsh scrubbing. Spot Treatment with Tea Tree Oil: Dilute tea tree oil with a carrier oil (like jojoba or grapeseed oil) and apply it to blemishes. Always do a patch test first. Hydration: Drink plenty of water and eat antioxidant-rich foods like berries and leafy greens.

Now, here are some products that might be helpful:

Response in XML format:

<products>
    <product>
        <id>1</id>
        <name>COSRX Salicylic Acid Daily Gentle Cleanser 150ml</name>
        <highlights>Oil Controlling, Acne Controlling, Exfoliating, Reduce Comedones</highlights>
        <price>995TK</price>
        <image_url>https://cdn.klassy.com.bd/uploads/products/products/oeq0fGTCiBSDKdsOyK5POtT3QWhAltUjnzAr1Pne.png</image_url>
        <buy_link>https://klassy.com.bd/product/COSRX-Salicylic-Acid-Daily-Gentle-Cleanser-150ml-z8eFy</buy_link>
    </product>
    <product>
        <id>2</id>
        <name>COSRX Salicylic Acid Daily Gentle Cleanser 150ml</name>
        <highlights>Oil Controlling, Acne Controlling, Exfoliating, Reduce Comedones</highlights>
        <price>995TK</price>
        <image_url>https://cdn.klassy.com.bd/uploads/products/products/oeq0fGTCiBSDKdsOyK5POtT3QWhAltUjnzAr1Pne.png</image_url>
        <buy_link>https://klassy.com.bd/product/COSRX-Salicylic-Acid-Daily-Gentle-Cleanser-150ml-z8eFy</buy_link>
    </product>
</products>

If a customer directly asks for product recommendations, quickly suggest the product.

**Provide Accurate Link to the Product Page and Image, and Ensure do not generate any false links or images.
**Show the product image and link to the product page.
*** Answer always in user's language.

By following these guidelines, you will provide valuable and safe skincare guidance to users, while promoting responsible self-care and encouraging professional consultation when necessary.

Use only the chat history and the following information
{context}
    
Current conversation:
{chat_history}

Human: {question}
AI Assistant:"""


CONVERSATIONAL_PROMPT = PromptTemplate(
    input_variables=["context", "question", "chat_history"],
    template=template,
)

# Add new tracking structures
class UserMetrics:
    def __init__(self):
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.last_request_time = None
        self.average_response_time = 0
        self.total_response_time = 0

# Add global metrics tracking
user_metrics = defaultdict(UserMetrics)

# Add new metrics tracking at the top with other global variables
class GlobalMetrics:
    def __init__(self):
        self.lifetime_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.start_time = datetime.now()
        self.active_users_24h = set()
        
    def to_dict(self):
        return {
            "lifetime_requests": self.lifetime_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "uptime": str(datetime.now() - self.start_time),
            "active_users_24h": len(self.active_users_24h)
        }

# Initialize global metrics
global_metrics = GlobalMetrics()


'''
The chat endpoint processes user queries, with optional image uploads, and manages chat sessions. 
It starts by creating a session or retrieving an existing one. If an image is uploaded, it's processed to extract a caption, which is added to the query. 
The query is then sent to an AI model for processing, with retries in case of failure. If the AI response contains XML (e.g., product details), it's parsed and extracted into a structured format; otherwise, the response is treated as plain text. 
The response is returned along with any parsed product data. A background task logs the chat data for later analysis. If errors occur, retries are attempted, and a final error response is returned if the maximum retry limit is reached.
'''

# Modified chat endpoint
@app.post("/chat")
async def chat(
    query: str = Form(...),
    userId: str = Form(...),
    domain: str = Form(...),
    image: Optional[UploadFile] = File(default=None, description="Image file to upload", media_type="image/*", include_in_schema=True, default_factory=None),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    try:
        start_time = time.time()
        
        # Create request object
        request = QueryRequest(userId=userId, query=query, domain=domain)
        
        # Get or create session
        session_key = f"{userId}"
        if session_key not in sessions:
            sessions[session_key] = UserSession(request.domain, userId)
        
        session = sessions[session_key]

        # Handle image if provided
        image_caption = ""
        if image and image.filename:

             # Process the image
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_image:
                    # Read the file in chunks to handle large files
                    contents = await image.read()
                    temp_image.write(contents)
                    temp_image.flush()
                    
                    # Get image caption
                    image_caption = get_image_caption(temp_image.name)
                    
            except Exception as e:
                logger.error(f"Error processing image: {str(e)}")
                # Continue without image if there's an error
                pass
            finally:
                # Clean up temporary file if it exists
                try:
                    os.unlink(temp_image.name)
                except:
                    pass
        
        
        # Process message with retries
        max_retries = 3
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                # Prepare query including image caption if provided
                full_query = request.query
                if image_caption:
                    full_query += f"\nMy skin conditions description: {image_caption}"

                # Process the conversation
                result = await session.conversation.ainvoke({
                    "question": full_query,
                    "chat_history": session.chat_history
                })

                # Parse the AI response to extract JSON
                response_text = result["answer"]
                formatted_response = {}

                # Try to find and parse XML in the response
                try:
                    # Attempt to find XML in the response
                    xml_match = re.findall(r'<products>[\s\S]*?</products>', response_text, re.DOTALL)
                    if xml_match:
                        # Extract the XML portion
                        xml_string = xml_match[0].replace("&", "&amp;") # Escape the & character
                        root = ET.fromstring(xml_string)

                        # Parse the XML into a products list
                        products = []
                        for product in root.findall('product'):
                            products.append({
                                "id": product.find('id').text,
                                "name": product.find('name').text,
                                "highlights": product.find('highlights').text,
                                "price": product.find('price').text,
                                "image_url": product.find('image_url').text,
                                "buy_link": product.find('buy_link').text,
                            })

                        # Remove the XML portion from the response text
                        remaining_text = re.sub(r'<products>[\s\S]*?</products>', '', response_text).strip()

                        # Format the response
                        formatted_response = {
                            "text": remaining_text,
                            "products": products
                        }
                    else:
                        # If no XML is found, treat the whole response as text
                        formatted_response = {
                            "text": response_text,
                            "products": []
                        }
                except ET.ParseError as e:
                    print(f"XML parsing error: {e}")  # Add logging for debugging
                    # Handle XML parsing errors and default to treating the response as text
                    formatted_response = {
                        "text": response_text,
                        "products": []
                    }

                # Update success metrics
                global_metrics.successful_requests += 1

                # Background task for database operations
                background_tasks.add_task(
                    save_chat_data,
                    session,
                    request.query,
                    formatted_response["text"],
                    userId,
                    start_time
                )

                # Return formatted response
                return JSONResponse(content={
                    "response": formatted_response["text"],
                    "products": formatted_response.get("products", []),
                    "userId": userId,
                    "timestamp": datetime.now().isoformat(),
                    "status": "success"
                })

            except Exception as e:
                retry_count += 1
                if retry_count < max_retries:
                    llm._rotate_key()
                    await asyncio.sleep(1)
                    continue
                raise

    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail={"error": str(e), "response": "Sorry, an error occurred. Please try again."}
        )

@app.post("/generate_questions")
async def generate_questions(query: Query):
    try:
        # Combine user message and AI response into context
        combined_context = f"User: {query.user_message}\nAI: {query.ai_response}"

        # Use LangChain to generate follow-up questions
        messages = [
            SystemMessage(
                content="You are NeuroBrain's Question Suggestion AI, and your goal is to guide users through helpful conversations by predicting relevant follow-up questions. Based on the user's original question you will generate only two or three follow-up short questions. The follow-up questions should: 1. Be relevant to both the user's original question and your answer. 2. Encourage deeper engagement or exploration of the topic. 3. Help guide the user toward meaningful next steps or further clarification. For example: First Interaction: - If the user asks, 'Hello! ' And Response from AI:  Hello Hello! NeuroBrain's AI-powered solutions are designed to automate and enhance your customer support experience. Whether you're looking to provide 24/7 support, reduce response times, or free up your human agents for more complex tasks, our Chatbots and Voice Assistants can help. They are customizable to fit your specific business needs and can integrate seamlessly with various platforms, including social media. How can I assist you further in exploring these solutions for your business? Your follow-up questions could be: 1. 'Does NeuroBrain support voice and chat? ' 2. ' My Business benefits ' 3. ' Pricing? ' Second Follow-up Interaction: User's Select: “Does NeuroBrain support voice and chat?” AI: Does Neur oBrain support voice and chat? Yes, NeuroBrain offers support for both voice and chat interactions. Our AI Chatbots and Voice Assistants are designed to cater to various user preferences, providing a seamless and versatile customer support experience. This allows businesses to engage with their customers across multiple channels effectively. Would you like to learn more about how these features can benefit your business?. Based on the conversation between the user and AI, generate 1-3 follow-up questions. the follow-up question in 3 to 5 words without emoji and special characters. Return only the questions separated by commas."
            ),
            HumanMessage(content=combined_context),
        ]
        response = llm.invoke(messages)

        # Extract questions from response
        questions = response.content.strip()
        return {"questions": questions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

async def save_chat_data(session, query, response, user_id, start_time):
    try:
        # Save to database and update memory
        session.save_message(query, response)
        
        # Update in-memory chat history
        session.chat_history.append((query, response))
        if len(session.chat_history) > 20:
            session.chat_history = session.chat_history[-20:]

        # Update metrics
        response_time = time.time() - start_time
        user_metrics[user_id].successful_requests += 1
        user_metrics[user_id].total_response_time += response_time
        user_metrics[user_id].average_response_time = (
            user_metrics[user_id].total_response_time / 
            user_metrics[user_id].successful_requests
        )

        # Save metrics to database
        with get_db() as db:
            db.execute('''
                INSERT INTO request_metrics 
                (user_id, request_time, response_time, success, error_message)
                VALUES (?, ?, ?, ?, ?)
            ''', (user_id, datetime.now(), response_time, True, None))
            db.commit()

    except Exception as e:
        logger.error(f"Error saving chat data: {str(e)}")

# Add health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }


@app.get("/")
async def root():
    return {"message": "API is running"}


# Running the Server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005, reload=True)
